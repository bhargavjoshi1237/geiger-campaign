"use client";

import React, { useState } from "react";
import { File as FileIcon, FileImage, FileSpreadsheet, FileText, FileVideo } from "lucide-react";
import { cn } from "@geiger/ui";
import { extOf } from "@/lib/content/files";

// The visual for one asset: the image or video itself, else an icon for its file type.

export const KIND_TONE = { image: "info", video: "purple", document: "success", other: "neutral" };

const SHEETS = new Set(["csv", "xls", "xlsx", "numbers"]);

export function assetIcon(asset) {
  if (asset?.kind === "image") return FileImage;
  if (asset?.kind === "video") return FileVideo;
  if (SHEETS.has(extOf(asset?.name))) return FileSpreadsheet;
  if (asset?.kind === "document") return FileText;
  return FileIcon;
}

export function AssetThumb({ asset, className, controls = false }) {
  const [broken, setBroken] = useState(false);
  const Icon = assetIcon(asset);
  if (asset?.url && !broken && asset.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={asset.url} alt={asset.altText || ""} className={className} loading="lazy" onError={() => setBroken(true)} />;
  }
  if (asset?.url && !broken && asset.kind === "video") {
    return <video src={asset.url} className={className} muted playsInline preload="metadata" controls={controls} onError={() => setBroken(true)} aria-label={asset.altText || asset.name} />;
  }
  return (
    <div className={cn("flex items-center justify-center bg-surface-card", className)}>
      <Icon className="h-8 w-8 text-text-tertiary" aria-hidden="true" />
    </div>
  );
}

export default AssetThumb;
