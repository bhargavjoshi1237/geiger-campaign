/*! Geiger Campaign tracking snippet v1 — identify / track / page, batched with sendBeacon. No dependencies. */
(function (w, d) {
  "use strict";

  var VERSION = "1.0.0";
  var STORAGE_KEY = "geiger_aid";
  var MAX_BATCH = 50;
  var FLUSH_MS = 2000;
  var stub = w.geiger;
  if (stub && stub.__loaded) return;

  var state = { key: null, endpoint: null, queue: [], timer: null, anonymousId: null, debug: false, lastPage: null };
  var scriptSrc = (d.currentScript && d.currentScript.src) || "";

  function noop() {}

  function log() {
    if (state.debug && w.console) w.console.log.apply(w.console, ["[geiger]"].concat([].slice.call(arguments)));
  }

  function uuid() {
    if (w.crypto && w.crypto.randomUUID) return w.crypto.randomUUID();
    var bytes = new Uint8Array(16);
    (w.crypto || w.msCrypto).getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = [].map.call(bytes, function (b) { return (b + 0x100).toString(16).slice(1); }).join("");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
  }

  function readCookie(name) {
    var match = d.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function writeCookie(name, value) {
    try {
      d.cookie = name + "=" + encodeURIComponent(value) + "; Max-Age=63072000; Path=/; SameSite=Lax" + (w.location.protocol === "https:" ? "; Secure" : "");
    } catch (e) {
      noop(e);
    }
  }

  function storageGet(name) {
    try {
      return w.localStorage.getItem(name);
    } catch (e) {
      return null;
    }
  }

  function storageSet(name, value) {
    try {
      if (value === null) w.localStorage.removeItem(name);
      else w.localStorage.setItem(name, value);
    } catch (e) {
      noop(e);
    }
  }

  // One id per browser, kept in both localStorage and a first-party cookie.
  function anonymousId() {
    if (!state.anonymousId) {
      state.anonymousId = storageGet(STORAGE_KEY) || readCookie(STORAGE_KEY) || uuid();
      storageSet(STORAGE_KEY, state.anonymousId);
      writeCookie(STORAGE_KEY, state.anonymousId);
    }
    return state.anonymousId;
  }

  // The ingest URL next to wherever this file was loaded from (…/sdk/v1.js -> …/api/public/track).
  function defaultEndpoint() {
    return scriptSrc ? scriptSrc.replace(/\/sdk\/v1(\.min)?\.js(\?.*)?$/, "/api/public/track") : "/api/public/track";
  }

  function pageContext() {
    return { url: w.location.href, referrer: d.referrer || undefined, title: d.title || undefined, path: w.location.pathname };
  }

  function send(batch, useBeacon) {
    var body = JSON.stringify({ key: state.key, library: "geiger-js/" + VERSION, batch: batch });
    log("send", batch);
    // A string body is text/plain, so neither path needs a CORS preflight.
    if (useBeacon && w.navigator.sendBeacon && body.length < 60000) {
      try {
        if (w.navigator.sendBeacon(state.endpoint, body)) return;
      } catch (e) {
        noop(e);
      }
    }
    try {
      w.fetch(state.endpoint, { method: "POST", body: body, headers: { "Content-Type": "text/plain" }, keepalive: body.length < 60000, credentials: "omit", mode: "cors" }).catch(noop);
    } catch (e) {
      noop(e);
    }
  }

  function flush(useBeacon) {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    if (!state.key || !state.queue.length) return;
    while (state.queue.length) send(state.queue.splice(0, MAX_BATCH), useBeacon !== false);
  }

  function enqueue(event) {
    event.anonymousId = anonymousId();
    event.timestamp = new Date().toISOString();
    event.messageId = uuid();
    state.queue.push(event);
    if (!state.key) return;
    if (state.queue.length >= 10) flush(true);
    else if (!state.timer) state.timer = setTimeout(function () { flush(true); }, FLUSH_MS);
  }

  var api = {
    __loaded: true,
    version: VERSION,

    // geiger.init("gcp_…", { endpoint, autoPage: true, trackHistory: true, debug: false })
    init: function (key, options) {
      var opts = options || {};
      state.key = key;
      state.endpoint = opts.endpoint || defaultEndpoint();
      state.debug = Boolean(opts.debug);
      if (opts.autoPage !== false) api.page();
      if (opts.trackHistory !== false && w.history && w.history.pushState) {
        var push = w.history.pushState;
        w.history.pushState = function () {
          var out = push.apply(this, arguments);
          setTimeout(function () { api.page(); }, 0);
          return out;
        };
        w.addEventListener("popstate", function () { api.page(); });
      }
      flush(true);
      log("ready", state.endpoint);
      return api;
    },

    // geiger.identify({ email, firstName, lastName, phone, …traits }) or geiger.identify("jane@x.com", { … })
    identify: function (emailOrTraits, traits) {
      var t = typeof emailOrTraits === "string" ? Object.assign({ email: emailOrTraits }, traits || {}) : Object.assign({}, emailOrTraits || {});
      enqueue({ type: "identify", traits: t });
    },

    // geiger.track("order_completed", { order_id: "1043", revenue: 129, currency: "USD" })
    track: function (name, properties, options) {
      if (!name) return;
      var props = Object.assign({}, properties || {});
      var opts = options || {};
      var ctx = pageContext();
      enqueue({ type: "track", event: String(name), properties: props, revenue: opts.revenue !== undefined ? opts.revenue : props.revenue, currency: opts.currency || props.currency, url: ctx.url, referrer: ctx.referrer });
    },

    // geiger.page() — sent automatically on init and on history navigation; repeated URLs are skipped.
    page: function (properties) {
      var ctx = pageContext();
      if (!properties && state.lastPage === ctx.url) return;
      state.lastPage = ctx.url;
      enqueue({ type: "page", properties: Object.assign({}, properties || {}), url: ctx.url, referrer: ctx.referrer, title: ctx.title, path: ctx.path });
    },

    // Forget this visitor (on logout): the next events start a new anonymous id.
    reset: function () {
      state.anonymousId = null;
      storageSet(STORAGE_KEY, null);
      writeCookie(STORAGE_KEY, "");
      d.cookie = STORAGE_KEY + "=; Max-Age=0; Path=/";
    },

    flush: function () {
      flush(false);
    },

    anonymousId: anonymousId,
  };

  d.addEventListener("visibilitychange", function () {
    if (d.visibilityState === "hidden") flush(true);
  });
  w.addEventListener("pagehide", function () { flush(true); });

  w.geiger = api;

  // Replay calls made through the loader stub before this file arrived: [["init", key, opts], ["track", …]].
  if (stub && stub.length) {
    var pending = [].slice.call(stub);
    var init = null;
    for (var i = 0; i < pending.length; i += 1) if (pending[i][0] === "init") init = pending[i];
    if (init) api.init.apply(api, init.slice(1));
    for (var j = 0; j < pending.length; j += 1) {
      var call = pending[j];
      if (call[0] !== "init" && typeof api[call[0]] === "function") api[call[0]].apply(api, call.slice(1));
    }
  }
})(window, document);
