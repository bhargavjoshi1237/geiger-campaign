// Commerce email HTML (isomorphic, pure): an email-safe product grid (product blocks, recommendation
// output) and the cart reminder message. Table layout and inline styles only, every value escaped.

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const safeUrl = (u) => (/^https?:\/\//i.test(String(u || "")) ? String(u) : "");

export function formatMoney(value, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value) || 0);
  } catch {
    return `${(Number(value) || 0).toFixed(2)} ${currency}`;
  }
}

const field = (item, camel, snake) => item?.[camel] ?? item?.[snake];

// products: recommendation items or product view models ({ title, price, compareAtPrice, imageUrl, url, currency }).
export function renderProductGridHtml(products, { columns = 2, currency, accent = "#111111", ctaLabel = "Shop now" } = {}) {
  const list = (Array.isArray(products) ? products : []).filter(Boolean);
  if (!list.length) return "";
  const cols = Math.min(3, Math.max(1, columns));
  const width = Math.floor(100 / cols);
  const rows = [];
  for (let i = 0; i < list.length; i += cols) {
    const cells = list.slice(i, i + cols).map((p) => {
      const image = safeUrl(field(p, "imageUrl", "image_url"));
      const url = safeUrl(p.url);
      const cur = p.currency || currency || "USD";
      const compare = field(p, "compareAtPrice", "compare_at_price");
      const price = `${compare && Number(compare) > Number(p.price) ? `<span style="text-decoration:line-through;color:#888888;">${esc(formatMoney(compare, cur))}</span> ` : ""}${esc(formatMoney(p.price, cur))}`;
      return `<td valign="top" width="${width}%" style="padding:8px;">
${image ? `<a href="${esc(url || image)}"><img src="${esc(image)}" alt="${esc(p.title)}" width="100%" style="display:block;width:100%;max-width:260px;border:0;border-radius:6px;" /></a>` : ""}
<p style="margin:8px 0 2px;font:600 14px/1.4 Helvetica,Arial,sans-serif;color:#111111;">${esc(p.title)}</p>
<p style="margin:0 0 8px;font:400 14px/1.4 Helvetica,Arial,sans-serif;color:#444444;">${price}</p>
${url ? `<a href="${esc(url)}" style="display:inline-block;padding:8px 14px;border-radius:6px;background:${esc(accent)};color:#ffffff;font:600 13px Helvetica,Arial,sans-serif;text-decoration:none;">${esc(ctaLabel)}</a>` : ""}
</td>`;
    });
    rows.push(`<tr>${cells.join("")}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join("")}</table>`;
}

// cart: raw or normalized cart ({ items, value, currency, checkout_url | checkoutUrl }).
export function renderCartReminderEmail({ cart, storeName = "our store", firstName = "", brand = {}, unsubscribeUrl = "" }) {
  const currency = cart?.currency || "USD";
  const items = Array.isArray(cart?.items) ? cart.items : [];
  const checkoutUrl = safeUrl(field(cart, "checkoutUrl", "checkout_url"));
  const accent = /^#[0-9a-f]{3,8}$/i.test(brand.primaryColor || "") ? brand.primaryColor : "#111111";
  const subject = `You left something in your cart at ${storeName}`;
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";

  const lines = items
    .map((i) => {
      const qty = Number(i.quantity ?? 1);
      return `<tr>
<td style="padding:8px 0;border-bottom:1px solid #eeeeee;font:400 14px/1.4 Helvetica,Arial,sans-serif;color:#111111;">${esc(i.title)} <span style="color:#888888;">× ${qty}</span></td>
<td align="right" style="padding:8px 0;border-bottom:1px solid #eeeeee;font:400 14px/1.4 Helvetica,Arial,sans-serif;color:#111111;">${esc(formatMoney(Number(i.price ?? 0) * qty, currency))}</td>
</tr>`;
    })
    .join("");

  const footer = [brand.footerText, brand.address].filter(Boolean).map(esc).join("<br />");
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:8px;"><tr><td style="padding:28px;">
${brand.logoUrl && safeUrl(brand.logoUrl) ? `<img src="${esc(brand.logoUrl)}" alt="${esc(storeName)}" height="32" style="display:block;height:32px;border:0;margin-bottom:20px;" />` : ""}
<p style="margin:0 0 12px;font:400 15px/1.5 Helvetica,Arial,sans-serif;color:#111111;">${esc(greeting)}</p>
<p style="margin:0 0 20px;font:400 15px/1.5 Helvetica,Arial,sans-serif;color:#111111;">Your cart at ${esc(storeName)} is saved. Here's what you left behind:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${lines}
<tr><td style="padding:12px 0 0;font:600 14px Helvetica,Arial,sans-serif;color:#111111;">Total</td><td align="right" style="padding:12px 0 0;font:600 14px Helvetica,Arial,sans-serif;color:#111111;">${esc(formatMoney(cart?.value, currency))}</td></tr>
</table>
${checkoutUrl ? `<p style="margin:24px 0 0;"><a href="${esc(checkoutUrl)}" style="display:inline-block;padding:12px 20px;border-radius:6px;background:${esc(accent)};color:#ffffff;font:600 14px Helvetica,Arial,sans-serif;text-decoration:none;">Return to checkout</a></p>` : ""}
</td></tr></table>
<p style="margin:16px 0 0;font:400 12px/1.5 Helvetica,Arial,sans-serif;color:#888888;">${footer}${footer && unsubscribeUrl ? "<br />" : ""}${unsubscribeUrl ? `<a href="${esc(unsubscribeUrl)}" style="color:#888888;">Unsubscribe</a>` : ""}</p>
</td></tr></table></body></html>`;

  const text = [
    greeting,
    "",
    `Your cart at ${storeName} is saved:`,
    ...items.map((i) => `- ${i.title} x ${Number(i.quantity ?? 1)}`),
    `Total: ${formatMoney(cart?.value, currency)}`,
    checkoutUrl ? `Return to checkout: ${checkoutUrl}` : "",
    unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : "",
  ]
    .filter((l) => l !== null)
    .join("\n");

  return { subject, html, text };
}
