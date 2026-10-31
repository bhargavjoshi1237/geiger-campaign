// Small RFC 4180 CSV reader/writer (pure, client- and server-safe): quoted fields, escaped quotes,
// CRLF/LF, and comma / semicolon / tab delimiters sniffed from the header line.

function sniffDelimiter(text) {
  const firstLine = text.slice(0, text.search(/\r?\n/) === -1 ? text.length : text.search(/\r?\n/));
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

// "a,b\n1,2" -> { headers: ["a","b"], rows: [{ a: "1", b: "2" }] }. Blank lines are skipped.
export function parseCsv(input, { maxRows = 50000 } = {}) {
  const text = String(input || "").replace(/^﻿/, "");
  const delimiter = sniffDelimiter(text);
  const records = [];
  let field = "";
  let record = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === delimiter) {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      record.push(field);
      if (record.some((v) => v.trim() !== "")) records.push(record);
      record = [];
      field = "";
      if (records.length > maxRows) break;
    } else {
      field += ch;
    }
  }
  record.push(field);
  if (record.some((v) => v.trim() !== "")) records.push(record);

  const [headerRow = [], ...body] = records;
  const headers = headerRow.map((h, i) => h.trim() || `column_${i + 1}`);
  const rows = body.slice(0, maxRows).map((values) => Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? "").trim()])));
  return { headers, rows, truncated: body.length > maxRows };
}

export function csvCell(value) {
  if (value === null || value === undefined) return "";
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvLine(values) {
  return `${values.map(csvCell).join(",")}\r\n`;
}

// [{...}] -> CSV text with the given column order.
export function toCsv(rows, columns) {
  return csvLine(columns) + rows.map((row) => csvLine(columns.map((c) => row[c]))).join("");
}
