/**
 * Streamdek Property Inspector — settings.js
 *
 * Handles:
 * - Auto-discovery of pear-desktop on configured host:port
 * - Connection + authorization flow (no manual JWT)
 * - Persistence via $PI protocol / Stream Deck settings API
 */

(function () {
  const $PI = window.$PI; // Stream Deck Property Inspector bridge (if available)

  /** Toggle visibility of auth-related UI based on checkbox */
  function updateAuthUI() {
    var useAuth = document.getElementById('useAuth').checked;
    var authorizeBtn = document.getElementById('authorize');
    authorizeBtn.style.display = useAuth ? 'block' : 'none';

    // Show the auth section info when auth is used
    if (!useAuth) {
      document.getElementById('authSection').style.display = 'none';
    }
  }

  /** Show a status message */
  function setStatus(message, type) {
    var el = document.getElementById('status');
    el.textContent = message;
    el.className = type || 'info';
  }

  /** Send settings to the plugin */
  function sendToPlugin(settings) {
    if ($PI && typeof $PI.setSettings === 'function') {
      $PI.setSettings(settings);
    }
  }

  /** Send global settings to the plugin */
  function sendGlobalToPlugin(settings) {
    if ($PI && typeof $PI.setGlobalSettings === 'function') {
      $PI.setGlobalSettings(settings);
    }
  }

  /** Load saved settings from the plugin */
  function loadSettings() {
    if ($PI && typeof $PI.getSettings === 'function') {
      $PI.getSettings();
    }
    if ($PI && typeof $PI.getGlobalSettings === 'function') {
      $PI.getGlobalSettings();
    }
  }

  /**
   * Probe pear-desktop on the configured host:port.
   * Uses a simple GET to the root endpoint (no auth required).
   * Timeout after 3 seconds.
   * When not using auth, also triggers connection after successful probe.
   */
  async function probe() {
    var host = document.getElementById('host').value || 'localhost';
    var port = parseInt(document.getElementById('port').value, 10) || 26538;
    var useAuth = document.getElementById('useAuth').checked;
    var btn = document.getElementById('discover');

    btn.disabled = true;
    btn.textContent = 'Probing...';
    setStatus('Probing ' + host + ':' + port + '...', 'info');

    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 3000);

    try {
      var resp = await fetch('http://' + host + ':' + port + '/', {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Any response means pear-desktop is reachable
      setStatus('pear-desktop reachable at ' + host + ':' + port, 'success');
      document.getElementById('host').value = host;
      document.getElementById('port').value = port.toString();

      // Save and connect (no auth mode: probe triggers immediate connect)
      if (!useAuth) {
        var settings = {
          host: host,
          port: port,
          useAuth: false,
        };
        sendGlobalToPlugin(settings);
        setStatus('Connected to ' + host + ':' + port, 'success');
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('authStatus').textContent = 'Connected (no auth)';
        document.getElementById('authStatus').style.color = '#51cf66';
      }
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        setStatus('Probe timed out (3s). Is pear-desktop running?', 'error');
      } else {
        setStatus('Cannot reach pear-desktop: ' + err.message, 'error');
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Probe Connection';
    }
  }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Probe Connection';
    }
  }

  /**
   * Trigger connection + authorization flow.
   * Saves host/port and instructs the plugin to connect and authenticate.
   */
  function authorize() {
    var host = document.getElementById('host').value.trim() || 'localhost';
    var port = parseInt(document.getElementById('port').value, 10) || 26538;
    var clientId = 'streamdek-' + Math.random().toString(36).substring(2, 10);

    var settings = {
      host: host,
      port: port,
      clientId: clientId,
      useAuth: true,
    };

    sendGlobalToPlugin(settings);
    setStatus('Connecting to ' + host + ':' + port + '... Check pear-desktop for the authorization dialog.', 'info');
    document.getElementById('clientIdDisplay').textContent = clientId;
    document.getElementById('clientInfo').style.display = 'block';
    document.getElementById('authSection').style.display = 'block';
    document.getElementById('authStatus').textContent = 'Waiting for authorization...';
    document.getElementById('authStatus').style.color = '#00d4ff';
  }

  /**
   * Save host/port only (no auth needed — connection triggers auth flow).
   */
  function save() {
    var host = document.getElementById('host').value.trim() || 'localhost';
    var port = parseInt(document.getElementById('port').value, 10) || 26538;

    var settings = { host: host, port: port };
    sendGlobalToPlugin(settings);
    setStatus('Settings saved. Host: ' + host + ':' + port, 'success');
  }

  /** Handle settings received from the plugin */
  function onDidReceiveSettings(ev) {
    var settings = ev.payload && ev.payload.settings ? ev.payload.settings : {};

    if (settings.host) {
      document.getElementById('host').value = settings.host;
    }
    if (settings.port) {
      document.getElementById('port').value = settings.port;
    }
  }

  /** Handle global settings received from the plugin */
  function onDidReceiveGlobalSettings(ev) {
    var settings = ev.payload && ev.payload.settings ? ev.payload.settings : {};

    if (settings.host && !document.getElementById('host').value) {
      document.getElementById('host').value = settings.host;
    }
    if (settings.port && !document.getElementById('port').value) {
      document.getElementById('port').value = settings.port;
    }
    if (settings.useAuth !== undefined) {
      document.getElementById('useAuth').checked = settings.useAuth === true;
      updateAuthUI();
    }
    if (settings.clientId) {
      document.getElementById('clientIdDisplay').textContent = settings.clientId;
      document.getElementById('clientInfo').style.display = 'block';
    }
    if (settings.accessToken) {
      document.getElementById('authSection').style.display = 'block';
      document.getElementById('authStatus').textContent = 'Authorized';
      document.getElementById('authStatus').style.color = '#51cf66';
      setStatus('Connected and authorized', 'success');
    }
  }

  // Wire up event listeners
  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('discover').addEventListener('click', probe);
    document.getElementById('authorize').addEventListener('click', authorize);
    document.getElementById('useAuth').addEventListener('change', updateAuthUI);

    // Listen for settings from the plugin
    if ($PI) {
      $PI.on('didReceiveSettings', onDidReceiveSettings);
      $PI.on('didReceiveGlobalSettings', onDidReceiveGlobalSettings);
      loadSettings();
    }
  });
})();
