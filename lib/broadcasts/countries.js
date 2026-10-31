// Country from an E.164 phone number by calling code (isomorphic, pure). Longest-prefix match; +1 is the
// shared North American plan, reported as US. Used for rate-card lookups and spend by country.

const CODES = [
  ["1", "US", "United States / Canada"],
  ["7", "RU", "Russia"],
  ["20", "EG", "Egypt"],
  ["27", "ZA", "South Africa"],
  ["30", "GR", "Greece"],
  ["31", "NL", "Netherlands"],
  ["32", "BE", "Belgium"],
  ["33", "FR", "France"],
  ["34", "ES", "Spain"],
  ["36", "HU", "Hungary"],
  ["39", "IT", "Italy"],
  ["40", "RO", "Romania"],
  ["41", "CH", "Switzerland"],
  ["43", "AT", "Austria"],
  ["44", "GB", "United Kingdom"],
  ["45", "DK", "Denmark"],
  ["46", "SE", "Sweden"],
  ["47", "NO", "Norway"],
  ["48", "PL", "Poland"],
  ["49", "DE", "Germany"],
  ["51", "PE", "Peru"],
  ["52", "MX", "Mexico"],
  ["54", "AR", "Argentina"],
  ["55", "BR", "Brazil"],
  ["56", "CL", "Chile"],
  ["57", "CO", "Colombia"],
  ["60", "MY", "Malaysia"],
  ["61", "AU", "Australia"],
  ["62", "ID", "Indonesia"],
  ["63", "PH", "Philippines"],
  ["64", "NZ", "New Zealand"],
  ["65", "SG", "Singapore"],
  ["66", "TH", "Thailand"],
  ["81", "JP", "Japan"],
  ["82", "KR", "South Korea"],
  ["84", "VN", "Vietnam"],
  ["86", "CN", "China"],
  ["90", "TR", "Turkey"],
  ["91", "IN", "India"],
  ["92", "PK", "Pakistan"],
  ["94", "LK", "Sri Lanka"],
  ["212", "MA", "Morocco"],
  ["234", "NG", "Nigeria"],
  ["254", "KE", "Kenya"],
  ["351", "PT", "Portugal"],
  ["352", "LU", "Luxembourg"],
  ["353", "IE", "Ireland"],
  ["358", "FI", "Finland"],
  ["420", "CZ", "Czechia"],
  ["852", "HK", "Hong Kong"],
  ["880", "BD", "Bangladesh"],
  ["886", "TW", "Taiwan"],
  ["966", "SA", "Saudi Arabia"],
  ["971", "AE", "United Arab Emirates"],
  ["972", "IL", "Israel"],
  ["974", "QA", "Qatar"],
];

const BY_CODE = new Map(CODES.map(([code, iso]) => [code, iso]));
const NAMES = new Map(CODES.map(([, iso, name]) => [iso, name]));

export const COUNTRY_OPTIONS = [...new Map(CODES.map(([, iso, name]) => [iso, { value: iso, label: name }])).values()].sort((a, b) =>
  a.label.localeCompare(b.label),
);

// "+351 912 345 678" -> "PT"; "" when the number has no recognised calling code.
export function countryForPhone(phone) {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  for (let len = 3; len >= 1; len -= 1) {
    const iso = BY_CODE.get(digits.slice(0, len));
    if (iso) return iso;
  }
  return "";
}

export function countryName(iso) {
  if (!iso) return "Unknown";
  if (iso === "*") return "All other countries";
  return NAMES.get(iso) || iso;
}
