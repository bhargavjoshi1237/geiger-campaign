// CSV parsing/writing for contact import and export (pure): RFC 4180 quoting, embedded newlines,
// doubled quotes, CRLF, a UTF-8 BOM and comma/semicolon/tab delimiters.

function detectDelimiter(text) {
  const firstLine = text.slice(0, text.search(/\r?\n/) === -1 ? text.length : text.search(/\r?\n/));
  const counts = [",", ";", "\t"].map((d) => {
    let inQuotes = false;
    let n = 0;
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) n += 1;
    }
    return [d, n];
  });
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

// text -> { headers: string[], rows: string[][] }; blank lines are dropped, short rows padded.
export function parseCsv(input, { delimiter } = {}) {
  const text = String(input ?? "").replace(/^﻿/, "");
  const sep = delimiter || detectDelimiter(text);
  const records = [];
  let record = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === sep) {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((cell) => String(cell).trim() !== ""));
  if (!nonEmpty.length) return { headers: [], rows: [] };
  const headers = nonEmpty[0].map((h, i) => String(h).trim() || `Column ${i + 1}`);
  const rows = nonEmpty.slice(1).map((r) => headers.map((_, i) => String(r[i] ?? "").trim()));
  return { headers, rows };
}

const quote = (value) => {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// [[...header], [...row]] -> CSV text with CRLF line endings (what spreadsheets expect).
export function toCsv(table) {
  return table.map((row) => row.map(quote).join(",")).join("\r\n");
}

const HEADER_GUESSES = [
  ["email", /^(e-?mail|email address|e-mail address|mail)$/],
  ["firstName", /^(first|first name|firstname|given name|forename)$/],
  ["lastName", /^(last|last name|lastname|surname|family name)$/],
  ["fullName", /^(name|full name|fullname|contact name|contact)$/],
  ["phone", /^(phone|phone number|mobile|mobile number|cell|telephone|tel|whatsapp)$/],
  ["tags", /^(tags?|labels?)$/],
  ["status", /^(status|subscription status|subscribed)$/],
  ["timezone", /^(time ?zone|tz)$/],
  ["locale", /^(locale|language|lang)$/],
];

const slug = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

// Best-effort column -> target mapping. customFields: [{ key, label }] map to "attributes.<key>".
export function guessMapping(headers, customFields = []) {
  const used = new Set();
  return headers.map((header) => {
    const h = String(header).trim().toLowerCase();
    for (const [target, pattern] of HEADER_GUESSES) {
      if (pattern.test(h) && !used.has(target)) {
        used.add(target);
        return target;
      }
    }
    const field = customFields.find((f) => slug(f.key) === slug(h) || slug(f.label) === slug(h));
    if (field && !used.has(`attributes.${field.key}`)) {
      used.add(`attributes.${field.key}`);
      return `attributes.${field.key}`;
    }
    return "skip";
  });
}

// Trigger a browser download of CSV text.
export function downloadCsv(filename, csvText) {
  const url = URL.createObjectURL(new Blob([`﻿${csvText}`], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
