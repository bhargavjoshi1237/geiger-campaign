/*! Geiger Campaign embed v1 — inline forms and popups for any website. No dependencies.
 *
 *   Inline form:  <div data-geiger-form="FORM_ID"></div>
 *                 <script src="https://YOUR-DEPLOYMENT/embed/v1.js" async></script>
 *   Popup:        <script src="https://YOUR-DEPLOYMENT/embed/v1.js" data-geiger-popup="POPUP_ID" async></script>
 *   Manual:       GeigerCampaign.renderForm(element, "FORM_ID"); GeigerCampaign.showPopup("POPUP_ID");
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) {
    var found = document.querySelectorAll('script[src*="/embed/v1.js"]');
    script = found[found.length - 1];
  }
  if (!script) return;
  var BASE = script.src.replace(/\/embed\/v1\.js(\?.*)?$/, "");

  if (window.GeigerCampaign && window.GeigerCampaign.__v1) {
    window.GeigerCampaign.__boot(script);
    return;
  }

  var CSS =
    ".gcw{font:inherit;color:inherit;box-sizing:border-box;line-height:1.5}" +
    ".gcw *,.gcw *::before,.gcw *::after{box-sizing:border-box}" +
    ".gcw-form{display:flex;flex-direction:column;gap:14px;position:relative}" +
    ".gcw-field{display:flex;flex-direction:column;gap:6px}" +
    ".gcw-label{font-size:14px;font-weight:500}" +
    ".gcw-opt{font-weight:400;opacity:.6}" +
    ".gcw-input{font:inherit;font-size:15px;width:100%;padding:9px 12px;border:1px solid rgba(127,127,127,.35);border-radius:6px;background:transparent;color:inherit}" +
    ".gcw-input:focus{outline:2px solid var(--gcw-primary);outline-offset:1px}" +
    ".gcw-check{display:flex;gap:10px;align-items:flex-start;font-size:14px}" +
    ".gcw-check input{margin-top:3px;width:16px;height:16px;accent-color:var(--gcw-primary)}" +
    ".gcw-help{font-size:12px;opacity:.7}" +
    ".gcw-err{font-size:12px;color:#c62828}" +
    ".gcw-note{font-size:12px;opacity:.7}" +
    ".gcw-btn{font:inherit;font-size:15px;font-weight:600;padding:10px 18px;border:0;border-radius:6px;cursor:pointer;background:var(--gcw-primary);color:var(--gcw-on-primary);align-self:flex-start}" +
    ".gcw-btn[disabled]{opacity:.6;cursor:default}" +
    ".gcw-ok{padding:14px 16px;border:1px solid rgba(127,127,127,.3);border-radius:8px;font-size:14px}" +
    ".gcw-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}" +
    ".gcw-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px}" +
    ".gcw-card{position:relative;background:var(--gcw-bg);color:var(--gcw-text);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.25);width:100%;max-width:440px;max-height:calc(100vh - 32px);overflow:auto;padding:24px}" +
    ".gcw-slide{position:fixed;bottom:16px;z-index:2147483646;width:calc(100% - 32px);max-width:380px}" +
    ".gcw-slide.gcw-right{right:16px}.gcw-slide.gcw-left{left:16px}" +
    ".gcw-banner{position:fixed;left:0;right:0;z-index:2147483646;background:var(--gcw-bg);color:var(--gcw-text);box-shadow:0 4px 24px rgba(0,0,0,.18);padding:16px}" +
    ".gcw-banner.gcw-top{top:0}.gcw-banner.gcw-bottom{bottom:0}" +
    ".gcw-banner-inner{max-width:960px;margin:0 auto;display:flex;flex-wrap:wrap;gap:12px 24px;align-items:center}" +
    ".gcw-banner .gcw-copy{flex:1 1 260px}.gcw-banner .gcw-form{flex:1 1 320px}" +
    ".gcw-title{font-size:20px;font-weight:600;margin:0 0 6px}" +
    ".gcw-body{font-size:14px;opacity:.8;margin:0 0 16px}" +
    ".gcw-banner .gcw-title{font-size:16px;margin:0 0 2px}.gcw-banner .gcw-body{margin:0}" +
    ".gcw-img{display:block;width:100%;border-radius:8px;margin:0 0 16px}" +
    ".gcw-x{position:absolute;top:8px;right:8px;width:32px;height:32px;border:0;border-radius:6px;background:transparent;color:inherit;font-size:20px;line-height:1;cursor:pointer;opacity:.7}" +
    ".gcw-x:hover{opacity:1}.gcw-banner .gcw-x{top:50%;transform:translateY(-50%)}";

  function injectStyles() {
    if (document.getElementById("gcw-styles")) return;
    var style = document.createElement("style");
    style.id = "gcw-styles";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var key in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, key) || attrs[key] == null) continue;
        if (key === "text") node.textContent = attrs[key];
        else if (key === "className") node.className = attrs[key];
        else node.setAttribute(key, attrs[key]);
      }
    }
    (children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function request(path, options) {
    return fetch(BASE + path, options).then(function (res) {
      if (res.status === 204) return { ok: res.ok, status: res.status, body: {} };
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (body) {
          return { ok: res.ok, status: res.status, body: body };
        });
    });
  }

  function post(path, body) {
    return request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}), keepalive: true });
  }

  function pageUtm() {
    var params = new URLSearchParams(window.location.search);
    var out = {};
    ["source", "medium", "campaign", "term", "content"].forEach(function (key) {
      var v = params.get("utm_" + key);
      if (v) out[key] = v;
    });
    return out;
  }

  function hiddenValue(field) {
    if (field.param === "static") return field.defaultValue || "";
    if (field.param === "referrer") return document.referrer || "";
    if (field.param === "page_url") return window.location.href;
    if (field.param && field.param.indexOf("utm_") === 0) return new URLSearchParams(window.location.search).get(field.param) || "";
    return "";
  }

  function readable(hex) {
    var v = String(hex || "").replace("#", "");
    if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
    if (!/^[0-9a-f]{6}$/i.test(v)) return "#fff";
    var n = parseInt(v, 16);
    var lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    return lum > 0.6 ? "#000" : "#fff";
  }

  function themeVars(node, brand) {
    var primary = (brand && brand.primaryColor) || "#111827";
    node.style.setProperty("--gcw-primary", primary);
    node.style.setProperty("--gcw-on-primary", readable(primary));
    node.style.setProperty("--gcw-bg", (brand && brand.backgroundColor) || "#ffffff");
    node.style.setProperty("--gcw-text", (brand && brand.textColor) || readable((brand && brand.backgroundColor) || "#ffffff"));
  }

  var counter = 0;

  function buildForm(form, options) {
    options = options || {};
    var uid = "gcw" + ++counter;
    var startedAt = Date.now();
    var errors = {};
    var node = el("form", { className: "gcw-form", novalidate: "novalidate", "aria-label": form.name });

    form.fields.forEach(function (field) {
      if (field.type === "hidden") return;
      var id = uid + "-" + field.id;
      var input;
      var wrap;
      var err = el("p", { className: "gcw-err", id: id + "-err", role: "alert" });
      err.hidden = true;
      if (field.type === "checkbox" || field.type === "consent") {
        input = el("input", { type: "checkbox", id: id, name: field.key });
        if (field.required) input.required = true;
        wrap = el("div", { className: "gcw-field" }, [
          el("label", { className: "gcw-check", for: id }, [input, el("span", { text: field.label + (field.required ? " (required)" : "") })]),
          field.helpText ? el("p", { className: "gcw-help", text: field.helpText }) : null,
          err,
        ]);
      } else {
        if (field.type === "textarea") input = el("textarea", { id: id, name: field.key, rows: "4", className: "gcw-input" });
        else if (field.type === "select") {
          input = el("select", { id: id, name: field.key, className: "gcw-input" }, [el("option", { value: "", text: field.placeholder || "Choose…" })]);
          field.options.forEach(function (o) {
            input.appendChild(el("option", { value: o, text: o }));
          });
        } else {
          input = el("input", {
            id: id,
            name: field.key,
            className: "gcw-input",
            type: field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text",
            autocomplete: field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.key === "first_name" ? "given-name" : field.key === "last_name" ? "family-name" : null,
            placeholder: field.placeholder || null,
          });
        }
        if (field.required) input.required = true;
        var label = el("label", { className: "gcw-label", for: id, text: field.label });
        if (!field.required) label.appendChild(el("span", { className: "gcw-opt", text: " (optional)" }));
        wrap = el("div", { className: "gcw-field" }, [label, input, field.helpText ? el("p", { className: "gcw-help", text: field.helpText }) : null, err]);
      }
      input.setAttribute("aria-describedby", id + "-err");
      errors[field.key] = { node: err, input: input };
      node.appendChild(wrap);
    });

    var honeypot = el("input", { type: "text", name: "_gc_hp", tabindex: "-1", autocomplete: "off" });
    node.appendChild(el("div", { className: "gcw-hp", "aria-hidden": "true" }, [el("label", { text: "Leave this field empty" }, [honeypot])]));
    if (form.consentText) node.appendChild(el("p", { className: "gcw-note", text: form.consentText }));
    var general = el("p", { className: "gcw-err", role: "alert" });
    general.hidden = true;
    node.appendChild(general);
    var button = el("button", { type: "submit", className: "gcw-btn", text: form.submitLabel || "Subscribe" });
    node.appendChild(button);

    function showErrors(map) {
      Object.keys(errors).forEach(function (key) {
        var entry = errors[key];
        var message = map && map[key];
        entry.node.textContent = message || "";
        entry.node.hidden = !message;
        if (message) entry.input.setAttribute("aria-invalid", "true");
        else entry.input.removeAttribute("aria-invalid");
      });
    }

    node.addEventListener("submit", function (event) {
      event.preventDefault();
      if (button.disabled) return;
      var values = {};
      form.fields.forEach(function (field) {
        if (field.type === "hidden") values[field.key] = hiddenValue(field);
        else {
          var input = node.elements.namedItem(field.key);
          if (!input) return;
          values[field.key] = field.type === "checkbox" || field.type === "consent" ? input.checked : input.value;
        }
      });
      button.disabled = true;
      general.hidden = true;
      showErrors({});
      post("/api/public/forms/" + encodeURIComponent(form.id) + "/submit", {
        fields: values,
        utm: pageUtm(),
        _gc_url: window.location.href,
        _gc_ref: document.referrer || "",
        _gc_hp: honeypot.value,
        _gc_ms: Date.now() - startedAt,
        popupId: options.popupId || null,
      })
        .then(function (res) {
          button.disabled = false;
          if (!res.ok) {
            showErrors(res.body.fieldErrors || {});
            general.textContent = res.body.error || "Something went wrong. Try again.";
            general.hidden = false;
            return;
          }
          if (options.onSuccess) options.onSuccess(res.body);
          if (res.body.redirectUrl && !res.body.confirmationRequired) {
            window.location.assign(res.body.redirectUrl);
            return;
          }
          var ok = el("div", { className: "gcw-ok", role: "status", text: res.body.message || form.successMessage });
          node.parentNode && node.parentNode.replaceChild(ok, node);
        })
        .catch(function () {
          button.disabled = false;
          general.textContent = "Network error — check your connection and try again.";
          general.hidden = false;
        });
    });
    return node;
  }

  function renderForm(container, formId) {
    if (!container || !formId || container.getAttribute("data-gc-mounted")) return;
    container.setAttribute("data-gc-mounted", "1");
    injectStyles();
    request("/api/public/forms/" + encodeURIComponent(formId)).then(function (res) {
      if (!res.ok || !res.body.form) {
        if (window.console) console.warn("[GeigerCampaign] form " + formId + ": " + ((res.body && res.body.error) || res.status));
        return;
      }
      var root = el("div", { className: "gcw" });
      themeVars(root, res.body.brand);
      root.appendChild(buildForm(res.body.form));
      container.appendChild(root);
      post("/api/public/forms/" + encodeURIComponent(formId) + "/view");
    });
  }

  function storage(kind) {
    try {
      var s = kind === "session" ? window.sessionStorage : window.localStorage;
      var probe = "__gcw";
      s.setItem(probe, "1");
      s.removeItem(probe);
      return s;
    } catch (e) {
      return null;
    }
  }

  function readState(id) {
    var s = storage("local");
    try {
      return (s && JSON.parse(s.getItem("gc_popup_" + id) || "{}")) || {};
    } catch (e) {
      return {};
    }
  }

  function writeState(id, patch) {
    var s = storage("local");
    if (!s) return;
    var next = readState(id);
    for (var k in patch) next[k] = patch[k];
    s.setItem("gc_popup_" + id, JSON.stringify(next));
  }

  function urlMatches(pattern, href) {
    var p = String(pattern || "").trim();
    if (!p) return false;
    var target = /^https?:/i.test(p) ? href : window.location.pathname + window.location.search;
    var source = p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp("^" + source + "$", "i").test(target);
  }

  function isMobile() {
    return window.matchMedia ? window.matchMedia("(max-width: 767px), (pointer: coarse)").matches : false;
  }

  function allowed(popup) {
    var t = popup.targeting || {};
    var urls = t.urls || {};
    var patterns = urls.patterns || [];
    if (urls.mode && urls.mode !== "all" && patterns.length) {
      var hit = patterns.some(function (p) {
        return urlMatches(p, window.location.href);
      });
      if ((urls.mode === "include" && !hit) || (urls.mode === "exclude" && hit)) return false;
    }
    var devices = t.devices && t.devices.length ? t.devices : ["desktop", "mobile"];
    if (devices.indexOf(isMobile() ? "mobile" : "desktop") === -1) return false;
    var state = readState(popup.id);
    if (state.converted) return false;
    var f = t.frequency || { type: "days", days: 7 };
    if (f.type === "once" && state.lastShown) return false;
    if (f.type === "session") {
      var ss = storage("session");
      if (ss && ss.getItem("gc_popup_s_" + popup.id)) return false;
    }
    if (f.type === "days" && state.lastShown && Date.now() - state.lastShown < (Number(f.days) || 7) * 86400000) return false;
    return true;
  }

  function armTrigger(trigger, fire) {
    var done = false;
    function once() {
      if (done) return;
      done = true;
      fire();
    }
    var type = (trigger && trigger.type) || "exit_intent";
    if (type === "delay") {
      setTimeout(once, Math.max(0, Number(trigger.value) || 0) * 1000);
    } else if (type === "scroll") {
      var target = Math.min(100, Math.max(1, Number(trigger.value) || 50));
      var onScroll = function () {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        if (max <= 0 || (window.scrollY / max) * 100 >= target) {
          window.removeEventListener("scroll", onScroll);
          once();
        }
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    } else if (type === "click") {
      document.addEventListener(
        "click",
        function (event) {
          var selector = trigger.value || "[data-geiger-open]";
          var hit = null;
          try {
            hit = event.target && event.target.closest ? event.target.closest(selector) : null;
          } catch (e) {
            hit = null;
          }
          if (!hit) return;
          event.preventDefault();
          done = false;
          once();
        },
        true,
      );
    } else if (isMobile()) {
      setTimeout(once, 30000);
    } else {
      document.addEventListener("mouseout", function onOut(event) {
        if (event.relatedTarget || event.clientY > 0) return;
        document.removeEventListener("mouseout", onOut);
        once();
      });
    }
  }

  function openPopup(bundle) {
    var popup = bundle.popup;
    var design = popup.design || {};
    var layout = design.layout || "modal";
    injectStyles();
    var titleId = "gcw-title-" + popup.id;
    var root = el("div", { className: "gcw", id: "gcw-popup-" + popup.id });
    themeVars(root, bundle.brand);

    var close = function () {
      if (root.parentNode) root.parentNode.removeChild(root);
      document.removeEventListener("keydown", onKey);
    };
    var onKey = function (event) {
      if (event.key === "Escape") close();
    };

    var copy = el("div", { className: "gcw-copy" }, [
      design.imageUrl && layout !== "banner" ? el("img", { className: "gcw-img", src: design.imageUrl, alt: "" }) : null,
      design.headline ? el("h2", { className: "gcw-title", id: titleId, text: design.headline }) : null,
      design.body ? el("p", { className: "gcw-body", text: design.body }) : null,
    ]);
    var formNode = buildForm(bundle.form, {
      popupId: popup.id,
      onSuccess: function () {
        writeState(popup.id, { converted: Date.now() });
      },
    });
    var closeBtn = design.showClose === false ? null : el("button", { type: "button", className: "gcw-x", "aria-label": "Close", text: "×" });
    if (closeBtn) closeBtn.addEventListener("click", close);

    if (layout === "banner") {
      var banner = el("div", { className: "gcw-banner " + (design.position === "bottom" ? "gcw-bottom" : "gcw-top"), role: "region", "aria-labelledby": design.headline ? titleId : null }, [
        el("div", { className: "gcw-banner-inner" }, [copy, formNode]),
        closeBtn,
      ]);
      root.appendChild(banner);
    } else if (layout === "slide_in") {
      var card = el("div", { className: "gcw-card", role: "dialog", "aria-labelledby": design.headline ? titleId : null }, [closeBtn, copy, formNode]);
      root.appendChild(el("div", { className: "gcw-slide " + (design.position === "bottom_left" ? "gcw-left" : "gcw-right") }, [card]));
    } else {
      var dialog = el("div", { className: "gcw-card", role: "dialog", "aria-modal": "true", "aria-labelledby": design.headline ? titleId : null }, [closeBtn, copy, formNode]);
      var overlay = el("div", { className: "gcw-overlay" }, [dialog]);
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay && design.showClose !== false) close();
      });
      root.appendChild(overlay);
    }
    document.body.appendChild(root);
    document.addEventListener("keydown", onKey);
    var first = root.querySelector("input:not([type=hidden]):not([tabindex='-1']),select,textarea");
    if (first && layout === "modal") first.focus();

    writeState(popup.id, { lastShown: Date.now(), count: (readState(popup.id).count || 0) + 1 });
    var ss = storage("session");
    if (ss) ss.setItem("gc_popup_s_" + popup.id, "1");
    post("/api/public/popups/" + encodeURIComponent(popup.id) + "/event", { type: "impression" });
  }

  function loadPopup(popupId, force) {
    if (!popupId) return;
    request("/api/public/popups/" + encodeURIComponent(popupId)).then(function (res) {
      if (!res.ok || !res.body.popup) {
        if (window.console) console.warn("[GeigerCampaign] popup " + popupId + ": " + ((res.body && res.body.error) || res.status));
        return;
      }
      var bundle = res.body;
      if (force) return openPopup(bundle);
      // A click trigger is the visitor asking for it, so frequency caps don't apply to it.
      var explicit = bundle.popup.trigger && bundle.popup.trigger.type === "click";
      if (!explicit && !allowed(bundle.popup)) return;
      armTrigger(bundle.popup.trigger, function () {
        if (document.getElementById("gcw-popup-" + bundle.popup.id)) return;
        if (explicit || allowed(bundle.popup)) openPopup(bundle);
      });
    });
  }

  function boot(tag) {
    var formId = tag && tag.getAttribute("data-geiger-form");
    if (formId) {
      var holder = el("div");
      tag.parentNode.insertBefore(holder, tag.nextSibling);
      renderForm(holder, formId);
    }
    var popupId = tag && tag.getAttribute("data-geiger-popup");
    if (popupId) loadPopup(popupId, false);
    var nodes = document.querySelectorAll("[data-geiger-form]:not(script)");
    for (var i = 0; i < nodes.length; i += 1) renderForm(nodes[i], nodes[i].getAttribute("data-geiger-form"));
  }

  window.GeigerCampaign = {
    __v1: true,
    __boot: boot,
    renderForm: renderForm,
    showPopup: function (popupId) {
      loadPopup(popupId, true);
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      boot(script);
    });
  } else boot(script);
})();
