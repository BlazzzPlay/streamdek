/**
 * Streamdek Property Inspector — settings.js
 *
 * Handles:
 * - Auto-discovery of pear-desktop on localhost:26538
 * - Manual host/port/token entry
 * - JWT validation (non-empty check)
 * - Persistence via $PI protocol / Stream Deck settings API
 */

(function () {
  const $PI = window.$PI; // Stream Deck Property Inspector bridge (if available)

  /** Show a status message */
  function setStatus(message, type) {
    const el = document.getElementById('status');
    el.textContent = message;
    el.className = type || 'info';
  }

  /** Send settings to the plugin */
  function sendToPlugin(settings) {
    if ($PI && typeof $PI.setSettings === 'function') {
      $PI.setSettings(settings);
    }
  }

  /** Load saved settings from the plugin */
  function loadSettings() {
    if ($PI && typeof $PI.getSettings === 'function') {
      $PI.getSettings();
    }
  }

  /**
   * Auto-discover pear-desktop by probing localhost:26538.
   * Timeout after 3 seconds.
   */
  async function discover() {
    const host = document.getElementById('host').value || 'localhost';
    const port = parseInt(document.getElementById('port').value, 10) || 26538;
    const btn = document.getElementById('discover');

    btn.disabled = true;
    btn.textContent = 'Probing...';
    setStatus('Probing ' + host + ':' + port + '...', 'info');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const resp = await fetch('http://' + host + ':' + port + '/api/v1/status', {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (resp.ok) {
        setStatus('pear-desktop found at ' + host + ':' + port, 'success');
        document.getElementById('host').value = host;
        document.getElementById('port').value = port;
      } else {
        setStatus('pear-desktop responded with status ' + resp.status, 'error');
      }
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        setStatus('Discovery timed out (3s). Is pear-desktop running?', 'error');
      } else {
        setStatus('Cannot reach pear-desktop: ' + err.message, 'error');
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Auto-Discover';
    }
  }

  /** Save settings with JWT validation */
  function save() {
    const host = document.getElementById('host').value.trim() || 'localhost';
    const port = parseInt(document.getElementById('port').value, 10) || 26538;
    const jwt = document.getElementById('jwt').value.trim();

    // JWT validation: must be non-empty
    if (!jwt) {
      setStatus('JWT token is required. Generate one in pear-desktop Settings → API Server.', 'error');
      return;
    }

    const settings = { host, port, jwt };
    sendToPlugin(settings);
    setStatus('Settings saved. Plugin will connect to ' + host + ':' + port, 'success');
  }

  /** Handle settings received from the plugin */
  function onDidReceiveSettings(ev) {
    const settings = ev.payload && ev.payload.settings ? ev.payload.settings : {};

    if (settings.host) {
      document.getElementById('host').value = settings.host;
    }
    if (settings.port) {
      document.getElementById('port').value = settings.port;
    }
    if (settings.jwt) {
      document.getElementById('jwt').value = settings.jwt;
    }
  }

  // Wire up event listeners
  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('discover').addEventListener('click', discover);
    document.getElementById('save').addEventListener('click', save);

    // Listen for settings from the plugin
    if ($PI) {
      $PI.on('didReceiveSettings', onDidReceiveSettings);
      loadSettings();
    }
  });
})();
