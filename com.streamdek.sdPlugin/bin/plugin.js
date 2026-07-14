import streamDeck$1, { streamDeck, action, SingletonAction } from '@elgato/streamdeck';

/** Base path for pear-desktop REST API */
/** Default pear-desktop host and port */
const DEFAULT_HOST = 'localhost';
const DEFAULT_PORT = 26538;
/** Probe timeout in milliseconds */
const PROBE_TIMEOUT_MS = 3000;
/** REST request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 5000;
/** WebSocket path — token is passed as query param */
const WS_PATH = '/api/v1/ws';

/** Error thrown when pear-desktop API returns a non-2xx status */
class ApiError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}
/**
 * REST client for pear-desktop API Server.
 * Implements the real auth flow: POST /auth/{clientId} returns { accessToken }.
 * All subsequent /api/* calls use Authorization: Bearer <accessToken>.
 * Volume should NEVER be read-modify-write via REST (bug #4458).
 */
class ApiClient {
    baseUrl = '';
    accessToken = '';
    fetchFn;
    constructor(fetchFn = globalThis.fetch) {
        this.fetchFn = fetchFn;
    }
    /** Set the target host and port */
    setBaseUrl(host, port) {
        this.baseUrl = `http://${host}:${port}`;
    }
    /** Set the access token from the auth flow */
    setToken(token) {
        this.accessToken = token;
    }
    /**
     * Authenticate with pear-desktop API Server.
     * Calls POST /auth/{clientId} — pear-desktop shows a dialog to the user.
     * On approval, returns { accessToken: "<jwt>" }.
     * The returned token is used as Bearer token for all /api/* calls.
     */
    async authenticate(clientId) {
        const url = `${this.baseUrl}/auth/${encodeURIComponent(clientId)}`;
        const response = await this.fetchFn(url, { method: 'POST' });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new ApiError(`Auth failed: ${response.status} ${text}`, response.status);
        }
        const body = (await response.json());
        return body.accessToken;
    }
    /** Perform a GET request with timeout and retry */
    async get(path) {
        return this.requestWithRetry('GET', path);
    }
    /** Perform a POST request with timeout and retry */
    async post(path, body) {
        const bodyStr = body ? JSON.stringify(body) : undefined;
        return this.requestWithRetry('POST', path, bodyStr);
    }
    // ─── Convenience methods — match real pear-desktop API Server endpoints ────
    togglePlay() {
        return this.post('/api/v1/toggle-play');
    }
    next() {
        return this.post('/api/v1/next');
    }
    previous() {
        return this.post('/api/v1/previous');
    }
    like() {
        return this.post('/api/v1/like');
    }
    dislike() {
        return this.post('/api/v1/dislike');
    }
    shuffle() {
        return this.post('/api/v1/shuffle');
    }
    /** Switch repeat mode: 0=off, 1=one, 2=all */
    switchRepeat(iteration) {
        return this.post('/api/v1/switch-repeat', { iteration });
    }
    /** Set absolute volume (0–100). Never reads current volume (bug #4458). */
    setVolume(volume) {
        return this.post('/api/v1/volume', { volume });
    }
    toggleMute() {
        return this.post('/api/v1/toggle-mute');
    }
    /** Seek to absolute position in seconds. */
    seekTo(seconds) {
        return this.post('/api/v1/seek-to', { seconds });
    }
    /** Get current song info. */
    getSong() {
        return this.get('/api/v1/song');
    }
    // ─── Private helpers ───────────────────────────────────────────────
    async requestWithRetry(method, path, body, attempt = 1) {
        const maxRetries = 2;
        try {
            const response = await this.request(method, path, body);
            if (response.status === 401) {
                // 401 is never retried — the token is invalid
                throw new ApiError('Unauthorized: check your access token', response.status);
            }
            if (!response.ok && response.status >= 400) {
                const text = await response.text().catch(() => '');
                throw new ApiError(`Request failed: ${response.status} ${text}`, response.status);
            }
            return response;
        }
        catch (err) {
            if (err instanceof ApiError &&
                err.status === 401) {
                throw err; // Never retry 401
            }
            if (attempt < maxRetries) {
                return this.requestWithRetry(method, path, body, attempt + 1);
            }
            throw err;
        }
    }
    async request(method, path, body) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const url = `${this.baseUrl}${path}`;
            const headers = {};
            if (this.accessToken) {
                headers['Authorization'] = `Bearer ${this.accessToken}`;
            }
            if (body) {
                headers['Content-Type'] = 'application/json';
            }
            const response = await this.fetchFn(url, {
                method,
                headers,
                body,
                signal: controller.signal,
            });
            return response;
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
}
/** Singleton API client instance */
const apiClient = new ApiClient();

/** Backoff sequence for reconnect: 1s → 2s → 4s → 8s → 16s → 32s → 60s cap */
const BACKOFF_SEQUENCE = [1000, 2000, 4000, 8000, 16000, 32000, 60000];
/**
 * WebSocket client for pear-desktop API Server communication.
 * Token is passed as a query parameter in the WS URL: /api/v1/ws?token=<jwt>
 * Typed event pub/sub for player state events.
 * Exponential backoff reconnect capped at 60s, reset on success.
 */
class WsClient {
    ws = null;
    listeners = new Map();
    failCount = 0;
    reconnectTimer = null;
    disposed = false;
    wsCtor;
    /** Called when reconnection is about to be scheduled. Receives delay in ms. */
    onReconnect = null;
    constructor(wsCtor = WebSocket) {
        this.wsCtor = wsCtor;
    }
    /**
     * Connect to the WebSocket server.
     * Token is appended as a query parameter: ws://host:port/api/v1/ws?token=<token>
     */
    connect(baseUrl, token) {
        this.disposed = false;
        const wsUrl = `${baseUrl}${WS_PATH}?token=${encodeURIComponent(token)}`;
        this.createSocket(wsUrl);
    }
    /** Close the WebSocket and stop reconnect attempts */
    disconnect() {
        this.disposed = true;
        this.clearReconnectTimer();
        this.listeners.clear();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
    /** Subscribe to typed WS events. Returns an unsubscribe function. */
    subscribe(type, handler) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }
        this.listeners.get(type).add(handler);
        return () => {
            const handlers = this.listeners.get(type);
            if (handlers) {
                handlers.delete(handler);
            }
        };
    }
    // ─── Private ────────────────────────────────────────────────────────
    createSocket(wsUrl) {
        if (this.disposed)
            return;
        try {
            this.ws = new this.wsCtor(wsUrl);
        }
        catch {
            this.scheduleReconnect(wsUrl);
            return;
        }
        this.ws.addEventListener('open', () => {
            this.failCount = 0; // Reset backoff on successful connection
        });
        this.ws.addEventListener('message', (event) => {
            this.handleMessage(event.data);
        });
        this.ws.addEventListener('close', (_event) => {
            if (!this.disposed) {
                this.scheduleReconnect(wsUrl);
            }
        });
        this.ws.addEventListener('error', () => {
            // Close event will fire after error, triggering reconnect
        });
    }
    handleMessage(raw) {
        try {
            const data = JSON.parse(raw);
            const handlers = this.listeners.get(data.type);
            if (handlers && handlers.size > 0) {
                for (const handler of handlers) {
                    handler(data);
                }
            }
        }
        catch {
            // Ignore unparseable messages
        }
    }
    scheduleReconnect(wsUrl) {
        if (this.disposed)
            return;
        const delay = BACKOFF_SEQUENCE[Math.min(this.failCount, BACKOFF_SEQUENCE.length - 1)];
        this.failCount++;
        if (this.onReconnect) {
            this.onReconnect(delay);
        }
        this.reconnectTimer = setTimeout(() => {
            this.createSocket(wsUrl);
        }, delay);
    }
    clearReconnectTimer() {
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
}
/** Singleton WebSocket client instance */
const wsClient = new WsClient();

/** Default player state before any WS events arrive */
const DEFAULT_STATE = {
    volume: 100,
    isPlaying: false,
    song: null,
    position: 0,
    muted: false,
    shuffle: false,
    repeat: 'off',
    isLiked: false,
    isDisliked: false,
};
/**
 * Caches player state from WebSocket events.
 * Volume is WS-only per bug #4458 — never modified via REST.
 * Actions read from this store; REST calls are fire-and-forget.
 */
class StateStore {
    state;
    listeners;
    constructor() {
        this.state = { ...DEFAULT_STATE };
        this.listeners = new Set();
    }
    /** Get the full player state snapshot */
    getState() {
        return { ...this.state };
    }
    /** Get a single state field */
    get(key) {
        return this.state[key];
    }
    /** Merge a partial update from a WS event into the cached state */
    update(delta) {
        this.state = { ...this.state, ...delta };
        this.notify();
    }
    /** Subscribe to state changes. Returns an unsubscribe function. */
    subscribe(listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
    notify() {
        const snapshot = this.getState();
        for (const listener of this.listeners) {
            listener(snapshot);
        }
    }
}
/** Singleton state store instance */
const stateStore = new StateStore();

/**
 * Manages connection lifecycle to pear-desktop API Server.
 *
 * Flow:
 *   1. connect(host, port) → probe TCP/HTTP reachability
 *   2. Probe OK → state 'connected'
 *   3. authenticate(clientId) → POST /auth/{clientId}
 *      a. pear-desktop shows user a dialog
 *      b. User clicks Allow → returns { accessToken }
 *      c. Stores token, transitions to 'authenticated'
 *   4. Start WebSocket for real-time events
 */
class ConnectionManager {
    apiClient;
    wsClient;
    state = 'disconnected';
    listeners = new Set();
    probeTimer = null;
    currentHost = DEFAULT_HOST;
    currentPort = DEFAULT_PORT;
    currentToken = '';
    constructor(apiClient, wsClient) {
        this.apiClient = apiClient;
        this.wsClient = wsClient;
    }
    /** Get the current connection state */
    getState() {
        return this.state;
    }
    /** Check if authenticated and ready for commands */
    isAuthenticated() {
        return this.state === 'authenticated';
    }
    /**
     * Initiate connection: probe the host/port to verify reachability.
     * Does NOT perform authentication — call authenticate() after probe succeeds.
     */
    connect(host, port) {
        this.currentHost = host;
        this.currentPort = port;
        this.apiClient.setBaseUrl(host, port);
        this.transition('connecting');
        this.startProbe();
    }
    /**
     * Authenticate with pear-desktop using the API Server auth flow.
     * POST /auth/{clientId} — user sees a dialog in pear-desktop.
     * On success, stores the access token and starts the WebSocket connection.
     */
    async authenticate(clientId) {
        this.transition('waiting_for_auth');
        try {
            const token = await this.apiClient.authenticate(clientId);
            this.currentToken = token;
            this.apiClient.setToken(token);
            this.transition('authenticated');
            this.startWsConnection();
        }
        catch {
            this.transition('disconnected');
        }
    }
    /** Disconnect WebSocket and reset to disconnected state */
    disconnect() {
        this.clearProbe();
        this.wsClient.disconnect();
        this.transition('disconnected');
    }
    /** Subscribe to state changes. Returns an unsubscribe function. */
    onStateChange(listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
    // ─── Private ────────────────────────────────────────────────────────
    transition(newState) {
        if (this.state === newState)
            return;
        this.state = newState;
        this.notify(newState);
    }
    notify(state) {
        for (const listener of this.listeners) {
            try {
                listener(state);
            }
            catch {
                // Per-action error boundary: one listener failing
                // should not prevent others from receiving state updates
            }
        }
    }
    startProbe() {
        this.clearProbe();
        const probeUrl = `http://${this.currentHost}:${this.currentPort}/`;
        const controller = new AbortController();
        this.probeTimer = setTimeout(() => {
            controller.abort();
            // Probe timed out — pear is unreachable
            this.transition('disconnected');
        }, PROBE_TIMEOUT_MS);
        fetch(probeUrl, { signal: controller.signal })
            .then(() => {
            this.clearProbe();
            this.transition('connected');
        })
            .catch(() => {
            this.clearProbe();
            // Probe failed — pear is unreachable
            this.transition('disconnected');
        });
    }
    startWsConnection() {
        const baseUrl = `http://${this.currentHost}:${this.currentPort}`;
        this.wsClient.onReconnect = (_delay) => {
            this.transition('connecting');
        };
        this.wsClient.connect(baseUrl, this.currentToken);
    }
    clearProbe() {
        if (this.probeTimer !== null) {
            clearTimeout(this.probeTimer);
            this.probeTimer = null;
        }
    }
}
/** Singleton connection manager — created at plugin boot */
let connectionManager;
function initConnectionManager(apiClient, wsClient) {
    connectionManager = new ConnectionManager(apiClient, wsClient);
    return connectionManager;
}

/**
 * Thin wrapper around streamDeck.logger with a debug toggle.
 * In non-debug mode, only errors are forwarded to the SDK logger.
 * In debug mode, all log levels are forwarded.
 */
class Logger {
    debugEnabled;
    constructor(debugEnabled = false) {
        this.debugEnabled = debugEnabled;
    }
    get isDebug() {
        return this.debugEnabled;
    }
    set isDebug(value) {
        this.debugEnabled = value;
    }
    trace(message) {
        if (this.debugEnabled) {
            streamDeck.logger.trace(message);
        }
    }
    debug(message) {
        if (this.debugEnabled) {
            streamDeck.logger.debug(message);
        }
    }
    info(message) {
        if (this.debugEnabled) {
            streamDeck.logger.info(message);
        }
    }
    warn(message) {
        if (this.debugEnabled) {
            streamDeck.logger.warn(message);
        }
    }
    error(message) {
        // Always log errors, regardless of debug mode
        streamDeck.logger.error(message);
    }
}
/** Singleton logger instance */
const logger = new Logger();

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol, Iterator */


function __esDecorate(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
}
function __runInitializers(thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
}
typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

/**
 * Base behavior for all Stream Dek actions:
 * - Checks connection state before executing
 * - Shows warning icon when disconnected
 * - Per-action try/catch error boundary
 */
class BaseKeypadAction extends SingletonAction {
    /**
     * Execute the action if authenticated. Otherwise show warning.
     */
    async executeIfReady(ev, fn) {
        if (!connectionManager.isAuthenticated()) {
            await ev.action.setImage('imgs/actions/warning');
            return;
        }
        try {
            await fn();
        }
        catch {
            await ev.action.setImage('imgs/actions/warning');
        }
    }
}
(() => {
    let _classDecorators = [action({ UUID: 'com.streamdek.play-pause' })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = BaseKeypadAction;
    (class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        async onKeyDown(ev) {
            await this.executeIfReady(ev, async () => {
                await apiClient.togglePlay();
                const isPlaying = stateStore.get('isPlaying');
                await ev.action.setState(isPlaying ? 1 : 0);
            });
        }
    });
    return _classThis;
})();
(() => {
    let _classDecorators = [action({ UUID: 'com.streamdek.next-track' })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = BaseKeypadAction;
    (class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        async onKeyDown(ev) {
            await this.executeIfReady(ev, async () => {
                await apiClient.next();
            });
        }
    });
    return _classThis;
})();
(() => {
    let _classDecorators = [action({ UUID: 'com.streamdek.previous-track' })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = BaseKeypadAction;
    (class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        async onKeyDown(ev) {
            await this.executeIfReady(ev, async () => {
                await apiClient.previous();
            });
        }
    });
    return _classThis;
})();
(() => {
    let _classDecorators = [action({ UUID: 'com.streamdek.like' })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = BaseKeypadAction;
    (class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        async onKeyDown(ev) {
            await this.executeIfReady(ev, async () => {
                await apiClient.like();
                const isLiked = stateStore.get('isLiked');
                await ev.action.setState(isLiked ? 1 : 0);
            });
        }
    });
    return _classThis;
})();
(() => {
    let _classDecorators = [action({ UUID: 'com.streamdek.dislike' })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = BaseKeypadAction;
    (class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        async onKeyDown(ev) {
            await this.executeIfReady(ev, async () => {
                await apiClient.dislike();
                const isDisliked = stateStore.get('isDisliked');
                await ev.action.setState(isDisliked ? 1 : 0);
            });
        }
    });
    return _classThis;
})();
(() => {
    let _classDecorators = [action({ UUID: 'com.streamdek.shuffle' })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = BaseKeypadAction;
    (class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        async onKeyDown(ev) {
            await this.executeIfReady(ev, async () => {
                await apiClient.shuffle();
                const shuffle = stateStore.get('shuffle');
                await ev.action.setState(shuffle ? 1 : 0);
            });
        }
    });
    return _classThis;
})();
(() => {
    let _classDecorators = [action({ UUID: 'com.streamdek.repeat' })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = BaseKeypadAction;
    (class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        async onKeyDown(ev) {
            await this.executeIfReady(ev, async () => {
                const mode = stateStore.get('repeat');
                const modeMap = { off: 0, one: 1, all: 2 };
                const nextIteration = ((modeMap[mode] ?? 0) + 1) % 3;
                await apiClient.switchRepeat(nextIteration);
                const stateMap = { 0: 0, 1: 1, 2: 2 };
                await ev.action.setState(stateMap[nextIteration]);
            });
        }
    });
    return _classThis;
})();

/**
 * Base behavior for encoder (dial) actions:
 * - Checks connection state before executing
 * - Shows warning state when disconnected
 * - Per-action try/catch error boundary
 */
class BaseEncoderAction extends SingletonAction {
    constructor() {
        super();
        // Show warning on encoder display when connection drops
        connectionManager.onStateChange((state) => {
            if (state !== 'authenticated') {
                this.showDisconnectedWarning();
            }
        });
    }
    async executeIfReady(fn) {
        if (!connectionManager.isAuthenticated()) {
            this.showDisconnectedWarning();
            return;
        }
        try {
            await fn();
        }
        catch {
            // Silently fail — warning state will be shown via ConnectionManager listener
        }
    }
    /**
     * Show a warning indicator on the encoder touch strip when pear-desktop is unreachable.
     */
    showDisconnectedWarning() {
        for (const action of this.actions) {
            action.setFeedback?.({ title: '⚠ Offline' }).catch(() => { });
        }
    }
    /**
     * Update feedback layout with current value text.
     */
    updateFeedback(value) {
        if (!connectionManager.isAuthenticated())
            return;
        for (const action of this.actions) {
            action.setFeedback?.({ title: value }).catch(() => { });
        }
    }
}
/**
 * Volume encoder action.
 * Rotate: adjust volume ±2 (from WS cache, bug #4458)
 * Press: toggle mute
 */
(() => {
    let _classDecorators = [action({ UUID: 'com.streamdek.volume' })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = BaseEncoderAction;
    (class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        async onDialRotate(ev) {
            await this.executeIfReady(async () => {
                const ticks = ev.payload.ticks;
                const delta = ticks * 2; // ±2 per tick
                const currentVol = stateStore.get('volume');
                const muted = stateStore.get('muted');
                // If muted and rotating up, unmute first
                if (muted && delta > 0) {
                    // Unmute at current volume level
                    const newVol = Math.max(0, Math.min(100, currentVol));
                    await apiClient.setVolume(newVol);
                    this.updateFeedback(`Vol: ${newVol}`);
                    return;
                }
                const newVol = Math.max(0, Math.min(100, currentVol + delta));
                await apiClient.setVolume(newVol);
                this.updateFeedback(`Vol: ${newVol}`);
            });
        }
        async onDialDown(ev) {
            await this.executeIfReady(async () => {
                const muted = stateStore.get('muted');
                if (muted) {
                    const currentVol = stateStore.get('volume');
                    await apiClient.setVolume(currentVol);
                    this.updateFeedback(`Vol: ${currentVol}`);
                }
                else {
                    await apiClient.setVolume(0);
                    this.updateFeedback('Muted');
                }
            });
        }
        async onDidReceiveSettings(ev) {
            // PI sends settings; update connection when JWT/host/port change
        }
    });
    return _classThis;
})();
/**
 * Seek encoder action.
 * Rotate: seek ±5 seconds
 * Press: play/pause
 */
(() => {
    let _classDecorators = [action({ UUID: 'com.streamdek.seek' })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = BaseEncoderAction;
    (class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        async onDialRotate(ev) {
            await this.executeIfReady(async () => {
                const ticks = ev.payload.ticks;
                const delta = ticks * 5; // ±5s per tick
                const currentPos = stateStore.get('position');
                const song = stateStore.get('song');
                const duration = song?.duration ?? 0;
                const newPos = Math.max(0, Math.min(duration || 9999, currentPos + delta));
                await apiClient.seekTo(newPos);
                this.updateFeedback(formatTime(newPos));
            });
        }
        async onDialDown(_ev) {
            await this.executeIfReady(async () => {
                await apiClient.togglePlay();
            });
        }
    });
    return _classThis;
})();
/** Format seconds as mm:ss */
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Generate a persistent client ID for this Stream Deck instance.
 * Stored in global settings so it survives plugin restarts.
 */
function generateClientId() {
    const randomPart = Math.random().toString(36).substring(2, 10);
    return `streamdek-${randomPart}`;
}
/**
 * Streamdek plugin entry point.
 *
 * Flow:
 *  1. Load or generate a persistent clientId
 *  2. Connect to pear-desktop (probe host:port)
 *  3. Authenticate via POST /auth/{clientId}
 *  4. Start WebSocket for real-time state updates
 *  5. Subscribe WS events to StateStore
 */
async function main() {
    // Initialize connection manager with injected services
    const connectionManager = initConnectionManager(apiClient, wsClient);
    // Load saved settings and attempt auto-connect
    const settings = await streamDeck$1.settings.getGlobalSettings();
    const host = settings.host || DEFAULT_HOST;
    const port = settings.port || DEFAULT_PORT;
    // Generate or retrieve persistent clientId
    let clientId = settings.clientId;
    if (!clientId) {
        clientId = generateClientId();
        await streamDeck$1.settings.setGlobalSettings({
            ...settings,
            clientId,
        });
        logger.info(`Generated new clientId: ${clientId}`);
    }
    // Load existing access token if available
    if (settings.accessToken) {
        apiClient.setToken(settings.accessToken);
    }
    // Subscribe WS events to StateStore using real pear-desktop event types
    wsClient.subscribe('PLAYER_INFO', (data) => {
        stateStore.update({
            song: data.song ?? null,
            isPlaying: data.isPlaying ?? false,
            volume: data.volume ?? 100,
            muted: data.muted ?? false,
            shuffle: data.shuffle ?? false,
            repeat: data.repeat ?? 'off',
            position: data.position ?? 0,
            isLiked: data.isLiked ?? false,
            isDisliked: data.isDisliked ?? false,
        });
    });
    wsClient.subscribe('PLAYER_STATE_CHANGED', (data) => {
        stateStore.update({
            isPlaying: data.isPlaying,
        });
    });
    wsClient.subscribe('VIDEO_CHANGED', (data) => {
        if (data.song) {
            stateStore.update({ song: data.song });
        }
    });
    wsClient.subscribe('POSITION_CHANGED', (data) => {
        stateStore.update({
            position: data.position,
        });
    });
    wsClient.subscribe('VOLUME_CHANGED', (data) => {
        stateStore.update({
            volume: data.volume,
            muted: data.muted,
        });
    });
    wsClient.subscribe('REPEAT_CHANGED', (data) => {
        stateStore.update({
            repeat: data.repeat,
        });
    });
    wsClient.subscribe('SHUFFLE_CHANGED', (data) => {
        stateStore.update({
            shuffle: data.shuffle,
        });
    });
    // Connect and authenticate
    logger.info(`Connecting to pear-desktop at ${host}:${port}`);
    connectionManager.connect(host, port);
    // Listen for state changes to initiate auth when probe succeeds
    connectionManager.onStateChange(async (state) => {
        if (state === 'connected') {
            logger.info('Probe successful — initiating authentication');
            try {
                await connectionManager.authenticate(clientId);
                logger.info('Authentication successful');
                // Persist access token for reconnection
                await streamDeck$1.settings.setGlobalSettings({
                    ...settings,
                    clientId,
                    host,
                    port,
                    accessToken: apiClient['accessToken'], // internal access, needed for persistence
                });
            }
            catch (err) {
                logger.error(`Authentication failed: ${String(err)}`);
            }
        }
        if (state === 'disconnected') {
            logger.info('Disconnected from pear-desktop');
        }
    });
    // Listen for settings changes from Property Inspector to reconnect
    streamDeck$1.settings.onDidReceiveGlobalSettings(async (ev) => {
        const newSettings = ev.payload?.settings;
        if (!newSettings)
            return;
        const newHost = newSettings.host || DEFAULT_HOST;
        const newPort = newSettings.port || DEFAULT_PORT;
        logger.info(`Settings changed — reconnecting to ${newHost}:${newPort}`);
        connectionManager.disconnect();
        connectionManager.connect(newHost, newPort);
        if (newSettings.clientId) {
            clientId = newSettings.clientId;
        }
    });
    // Connect to Stream Deck
    await streamDeck$1.connect();
    logger.info('Streamdek plugin started');
}
main().catch((err) => {
    logger.error(`Plugin startup failed: ${String(err)}`);
});
//# sourceMappingURL=plugin.js.map
