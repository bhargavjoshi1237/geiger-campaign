// Company domain helpers shared by the data layer, the association route and the screens.

// Personal mailbox providers: an address there says nothing about the person's employer.
export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.de",
  "web.de",
  "mail.com",
  "zoho.com",
  "yandex.com",
  "qq.com",
  "163.com",
  "hey.com",
  "fastmail.com",
]);

// "https://www.Northwind.io/about" -> "northwind.io"; "" when nothing host-like remains.
export function normalizeDomain(input) {
  let value = String(input || "").trim().toLowerCase();
  if (!value) return "";
  if (value.includes("@")) value = value.split("@").pop();
  value = value.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "");
  value = value.split(/[/?#:]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value) ? value : "";
}

export function emailDomain(email) {
  const value = String(email || "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  return at > 0 ? value.slice(at + 1) : "";
}

export function isFreeMailDomain(domain) {
  return FREE_MAIL_DOMAINS.has(normalizeDomain(domain));
}
