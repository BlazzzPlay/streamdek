/**
 * Streamdek Controller Property Inspector — settings.js
 *
 * Handles:
 * - Auto-discovery of pear-desktop on configured host:port
 * - Connection via probe (no auth needed)
 * - Persistence via $PI protocol / Stream Deck settings API
 */

(function () {
  const $PI = window.$PI; // Stream Deck Property Inspector bridge (if available)

  /** Show a status message */
  function setStatus(message, type) {
    var el = document.getElementById('status');
    el.textContent = message;
    el.className = type || 'info';
  }

  /** Send global settings to the plugin */
  function sendGlobalToPlugin(settings) {
    if ($PI && typeof $PI.setGlobalSettings === 'function') {
      $PI.setGlobalSettings(settings);
    }
  }

  /** Load saved settings from the plugin */
  function loadSettings() {
    if ($PI && typeof $PI.getGlobalSettings === 'function') {
      $PI.getGlobalSettings();
    }
  }

  /**
   * Probe pear-desktop on the configured host:port.
   * Uses a simple GET to the root endpoint (no auth required).
   * Timeout after 3 seconds.
   * Triggers connection after successful probe.
   */
  async function probe() {
    var host = document.getElementById('host').value || 'localhost';
    var port = parseInt(document.getElementById('port').value, 10) || 26538;
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
      document.getElementById('host').value = host;
      document.getElementById('port').value = port.toString();

      // Save and connect
      var settings = {
        host: host,
        port: port,
      };
      sendGlobalToPlugin(settings);
      setStatus('Connected to ' + host + ':' + port, 'success');
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        setStatus('Probe timed out (3s). Is pear-desktop running?', 'error');
      } else {
        setStatus('Cannot reach pear-desktop: ' + err.message, 'error');
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Probe & Connect';
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
  }

  // Wire up event listeners
  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('discover').addEventListener('click', probe);

    // Listen for settings from the plugin
    if ($PI) {
      $PI.on('didReceiveGlobalSettings', onDidReceiveGlobalSettings);
      loadSettings();
    }
  });
})();
