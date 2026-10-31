// File helpers shared by the asset library, files, image editor and storage layer. Pure.

const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export const ASSET_KINDS = [
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "document", label: "Document" },
  { value: "other", label: "Other" },
];

export const ASSET_KIND_LABEL = Object.fromEntries(ASSET_KINDS.map((k) => [k.value, k.label]));

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const DOCUMENT_MIME = /^(application\/(pdf|msword|vnd\.|rtf|json|xml)|text\/)/;

export function assetKindFromMime(mime = "", name = "") {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (DOCUMENT_MIME.test(mime)) return "document";
  const ext = extOf(name);
  if (["pdf", "doc", "docx", "xls", "xlsx", "csv", "ppt", "pptx", "txt", "md", "rtf", "key", "pages", "numbers"].includes(ext)) return "document";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "m4v"].includes(ext)) return "video";
  return "other";
}

export function extOf(name = "") {
  const dot = String(name).lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : "";
}

// "PNG", "PDF"… from the file name, else the MIME subtype.
export function formatLabel(name = "", mime = "") {
  const ext = extOf(name);
  if (ext) return ext.toUpperCase();
  const sub = String(mime).split("/")[1] || "";
  return sub ? sub.split("+")[0].toUpperCase() : "FILE";
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return "0 KB";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function normalizeAsset(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled asset",
    kind: row.kind ?? "other",
    url: row.url ?? "",
    storagePath: row.storage_path ?? null,
    size: Number(row.size ?? 0) || 0,
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    mime: row.mime ?? "",
    altText: row.alt_text ?? "",
    tags: Array.isArray(row.tags) ? row.tags : [],
    folder: row.folder ?? "",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function assetToRow(input) {
  const row = {};
  const map = { name: "name", kind: "kind", url: "url", storagePath: "storage_path", mime: "mime", createdBy: "created_by" };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("altText" in input) row.alt_text = String(input.altText || "");
  if ("folder" in input) row.folder = String(input.folder || "").trim();
  if ("tags" in input) row.tags = Array.isArray(input.tags) ? [...new Set(input.tags.map((t) => String(t).trim()).filter(Boolean))] : [];
  if ("size" in input) row.size = Number(input.size) || 0;
  if ("width" in input) row.width = input.width == null ? null : Math.round(Number(input.width)) || null;
  if ("height" in input) row.height = input.height == null ? null : Math.round(Number(input.height)) || null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

// "a, b,c" -> ["a", "b", "c"]
export function parseTags(value) {
  return [...new Set(String(value || "").split(",").map((t) => t.trim()).filter(Boolean))];
}
