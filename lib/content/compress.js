"use client";

// Client-side image compression before upload: re-encodes and, if needed, downscales an image until it
// fits under `maxKB`. JPEG for photos; images with transparency try WebP so logos keep their alpha.
// GIF and SVG pass through untouched (re-encoding would drop animation / vectors).

const PASS_THROUGH = new Set(["image/gif", "image/svg+xml"]);

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));

function fit(w, h, max) {
  const ratio = Math.min(1, max / w, max / h);
  return { w: Math.max(1, Math.round(w * ratio)), h: Math.max(1, Math.round(h * ratio)) };
}

function hasAlpha(ctx, w, h) {
  const { data } = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < data.length; i += 16) if (data[i] < 250) return true;
  return false;
}

function rename(name, ext) {
  return `${(name || "image").replace(/\.[^.]+$/, "")}.${ext}`;
}

export async function compressImage(file, { maxKB = 500, maxDimension = 2400 } = {}) {
  if (typeof window === "undefined" || !file || !file.type?.startsWith("image/") || PASS_THROUGH.has(file.type)) return file;
  const limit = maxKB * 1024;
  try {
    const img = await loadImage(file);
    let { w, h } = fit(img.naturalWidth || img.width, img.naturalHeight || img.height, maxDimension);
    const probe = document.createElement("canvas");
    probe.width = Math.min(w, 256);
    probe.height = Math.min(h, 256);
    const pctx = probe.getContext("2d");
    pctx.drawImage(img, 0, 0, probe.width, probe.height);
    const alpha = file.type !== "image/jpeg" && hasAlpha(pctx, probe.width, probe.height);

    if (file.size <= limit && (img.naturalWidth || 0) <= maxDimension && (img.naturalHeight || 0) <= maxDimension) return file;

    let type = alpha ? "image/webp" : "image/jpeg";
    let quality = 0.9;
    let best = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!alpha) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      let blob = await toBlob(canvas, type, quality);
      // Browsers without WebP encoding hand back PNG; keep the alpha and shrink dimensions instead.
      if (blob && type === "image/webp" && blob.type !== "image/webp") type = "image/png";
      if (type === "image/png") blob = await toBlob(canvas, "image/png");
      if (!blob) break;
      best = blob;
      if (blob.size <= limit) break;
      if (type !== "image/png" && quality > 0.5) quality -= 0.12;
      else {
        w = Math.round(w * 0.82);
        h = Math.round(h * 0.82);
        quality = 0.82;
        if (w < 160 || h < 160) break;
      }
    }
    if (!best || best.size >= file.size) return file;
    const ext = best.type === "image/webp" ? "webp" : best.type === "image/png" ? "png" : "jpg";
    return new File([best], rename(file.name, ext), { type: best.type, lastModified: Date.now() });
  } catch (e) {
    console.error("[content.compressImage]", e);
    return file;
  }
}

// Natural pixel size of an image file, or nulls when it can't be decoded.
export async function imageSize(file) {
  if (typeof window === "undefined" || !file?.type?.startsWith("image/")) return { width: null, height: null };
  try {
    const img = await loadImage(file);
    return { width: img.naturalWidth || null, height: img.naturalHeight || null };
  } catch {
    return { width: null, height: null };
  }
}
