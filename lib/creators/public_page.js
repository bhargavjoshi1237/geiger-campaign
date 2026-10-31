// Minimal server-rendered pages for creators who follow a link without signing in (outreach opt-out,
// UGC rights decision). Neutral suite styling with light/dark support; every value is escaped.

export const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const STYLE = `
:root{color-scheme:light dark;--bg:Canvas;--fg:CanvasText;--muted:color-mix(in srgb,CanvasText 62%,Canvas);--border:color-mix(in srgb,CanvasText 14%,Canvas);--card:color-mix(in srgb,CanvasText 3%,Canvas)}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg);color:var(--fg);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:100%;max-width:440px;border:1px solid var(--border);background:var(--card);border-radius:12px;padding:28px}
h1{margin:0 0 8px;font-size:20px;font-weight:600;letter-spacing:-.01em}p{margin:0 0 12px;color:var(--muted)}p strong{color:var(--fg);font-weight:500}
form{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}button{font:inherit;font-weight:500;border-radius:8px;padding:9px 16px;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--fg)}
button.primary{background:var(--fg);color:var(--bg);border-color:var(--fg)}button:focus-visible{outline:2px solid var(--fg);outline-offset:2px}
a{color:inherit}small{display:block;margin-top:20px;color:var(--muted);font-size:12px}`;

// body is trusted markup built by the caller from escaped values.
export function publicPage({ title, body, status = 200 }) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export function notFoundPage(message = "This link is invalid or has expired.") {
  return publicPage({ title: "Link unavailable", body: `<h1>Link unavailable</h1><p>${escapeHtml(message)}</p>`, status: 404 });
}

export function clientInfo(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return {
    ip: forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || null,
    userAgent: (request.headers.get("user-agent") || "").slice(0, 300) || null,
  };
}
