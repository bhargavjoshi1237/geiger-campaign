"use client";

import { createClient, isSupabaseConfigured } from "./client";
import { compressImage, imageSize } from "@/lib/content/compress";

// File storage for Campaign. Everything lives in the suite's public "products" bucket under
// campaign/<project-uuid>/<area>/<file>; reads are public, writes need project membership and only the
// uploader may replace or remove an object (storage RLS). Persist the public URL, not the path alone.
//
//   const file = await uploadCampaignFile(projectId, picked, { area: "assets" });

export const CAMPAIGN_MEDIA_BUCKET = "products";

export function campaignMediaPrefix(projectId, area = "assets") {
  return `campaign/${projectId}/${area}`;
}

export function buildPublicUrl(path) {
  if (!path || !isSupabaseConfigured()) return null;
  const { data } = createClient().storage.from(CAMPAIGN_MEDIA_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

// The object path inside the bucket for a stored public URL (for removal).
export function pathFromPublicUrl(url) {
  if (!url) return null;
  const marker = `/object/public/${CAMPAIGN_MEDIA_BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}

function extFromFile(file) {
  const fromName = (file?.name || "").split(".").pop();
  if (fromName && fromName !== file?.name && fromName.length <= 5) return fromName.toLowerCase();
  const fromType = (file?.type || "").split("/")[1];
  return (fromType || "bin").split("+")[0].toLowerCase();
}

function uniqueName(file) {
  const stem = (file?.name || "file")
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "file";
  const rand = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${Date.now().toString(36)}-${rand}-${stem}.${extFromFile(file)}`;
}

// Upload one file. Images are compressed under ~500 KB first unless `compress: false`.
// Returns { path, url, size, mime, name, width, height } or null on failure (caller owns the UX).
export async function uploadCampaignFile(projectId, file, { area = "assets", compress = true } = {}) {
  if (!projectId || !file || !isSupabaseConfigured()) return null;
  try {
    const payload = compress && file.type?.startsWith("image/") ? await compressImage(file, { maxKB: 500 }) : file;
    const path = `${campaignMediaPrefix(projectId, area)}/${uniqueName(payload)}`;
    const { error } = await createClient()
      .storage.from(CAMPAIGN_MEDIA_BUCKET)
      .upload(path, payload, {
        cacheControl: "31536000",
        upsert: false,
        contentType: payload.type || file.type || "application/octet-stream",
      });
    if (error) {
      console.error("[storage.upload]", error.message);
      return null;
    }
    const { width, height } = await imageSize(payload);
    return {
      path,
      url: buildPublicUrl(path),
      size: payload.size ?? file.size ?? 0,
      mime: payload.type || file.type || "",
      name: file.name || payload.name || "file",
      width,
      height,
    };
  } catch (e) {
    console.error("[storage.upload]", e);
    return null;
  }
}

export async function removeCampaignFile(path) {
  if (!path || !isSupabaseConfigured()) return false;
  try {
    const { error } = await createClient().storage.from(CAMPAIGN_MEDIA_BUCKET).remove([path]);
    if (error) {
      console.error("[storage.remove]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[storage.remove]", e);
    return false;
  }
}
