/**
 * Mock session only. Any non-empty username + password is accepted
 * by login.html. No accounts, no backend.
 */
(function (global) {
  var KEY = "rf_session";

  function get() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "null");
    } catch (e) {
      return null;
    }
  }

  function set(username) {
    localStorage.setItem(KEY, JSON.stringify({
      username: String(username || "").trim(),
      at: new Date().toISOString()
    }));
  }

  function clear() {
    localStorage.removeItem(KEY);
  }

  function requireQuote() {
    if (!get()) location.replace("login.html");
  }

  global.FreightSession = { get: get, set: set, clear: clear, requireQuote: requireQuote };
})(window);
