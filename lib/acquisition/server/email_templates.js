import { emailColors } from "@/lib/content/brand";

// The double opt-in confirmation email, rendered here (pre-rendered mode) with the project's brand kit:
// logo, primary colour on the button, footer text and postal address. Server-only.

const escape = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const lines = (value) => escape(value).replace(/\r?\n/g, "<br />");

export function confirmationEmail({ brand = {}, formName = "", confirmUrl }) {
  const c = emailColors(brand);
  const sender = brand.displayName || "us";
  const subject = `Confirm your subscription${brand.displayName ? ` to ${brand.displayName}` : ""}`;
  const logo = brand.logoUrl
    ? `<img src="${escape(brand.logoUrl)}" alt="${escape(brand.displayName || "Logo")}" height="32" style="display:block;height:32px;width:auto;border:0;" />`
    : `<span style="font-size:16px;font-weight:600;color:${c.text};">${escape(brand.displayName || "")}</span>`;
  const footer = [brand.footerText, brand.companyAddress].filter(Boolean).map(lines).join("<br /><br />");

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background:${c.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${c.text};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.background};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="padding-bottom:24px;">${logo}</td></tr>
        <tr><td style="font-size:20px;font-weight:600;line-height:28px;padding-bottom:12px;">Please confirm your subscription</td></tr>
        <tr><td style="font-size:15px;line-height:24px;color:${c.muted};padding-bottom:24px;">
          You asked to hear from ${escape(sender)}${formName ? ` via “${escape(formName)}”` : ""}. Confirm your email address and you're in. If this wasn't you, ignore this email and nothing will happen.
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <a href="${escape(confirmUrl)}" style="display:inline-block;background:${c.primary};color:${c.onPrimary};text-decoration:none;font-size:15px;font-weight:600;padding:12px 20px;border-radius:8px;">Confirm subscription</a>
        </td></tr>
        <tr><td style="font-size:13px;line-height:20px;color:${c.muted};padding-bottom:32px;">
          Or paste this link into your browser:<br /><a href="${escape(confirmUrl)}" style="color:${c.primary};word-break:break-all;">${escape(confirmUrl)}</a>
        </td></tr>
        ${footer ? `<tr><td style="border-top:1px solid ${c.border};padding-top:16px;font-size:12px;line-height:18px;color:${c.muted};">${footer}</td></tr>` : ""}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, html };
}
