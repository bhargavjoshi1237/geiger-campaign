"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ImageIcon, Loader2, Upload } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  LoadingArea,
  SearchInput,
  cn,
} from "@geiger/ui";
import { listAssets, uploadAsset } from "@/lib/supabase/assets";
import { getUser } from "@/lib/supabase/user";
import { MAX_UPLOAD_BYTES } from "@/lib/content/files";

// Pick an image from the asset library, or upload one into it, for logos, page blocks and popups.
export function AssetPicker({ open, onOpenChange, projectId, onPick, title = "Choose an image", folder = "Uploads", compress = true }) {
  const [assets, setAssets] = useState(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open || !projectId) return undefined;
    let cancelled = false;
    listAssets(projectId, { kind: "image" }).then((rows) => {
      if (!cancelled) setAssets(rows ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (assets || []).filter((a) => !q || a.name.toLowerCase().includes(q) || a.tags.some((t) => t.toLowerCase().includes(q)));
  }, [assets, query]);

  const close = (next) => {
    if (!next) {
      setSelected(null);
      setQuery("");
    }
    onOpenChange(next);
  };

  const upload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file (PNG, JPG, WebP, GIF or SVG).");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`"${file.name}" is over the 25 MB limit.`);
      return;
    }
    setUploading(true);
    const user = await getUser().catch(() => null);
    const asset = await uploadAsset(projectId, file, { folder, compress, createdBy: user?.id ?? null });
    setUploading(false);
    if (!asset) {
      toast.error(`Couldn't upload "${file.name}".`);
      return;
    }
    setAssets((prev) => [asset, ...(prev || [])]);
    onPick(asset);
    close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Pick from your asset library or upload a new image. Uploads are optimised to under 500 KB.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button variant="outline" className="bg-surface-card" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload image
          </Button>
          <SearchInput value={query} onChange={setQuery} placeholder="Search images…" />
        </div>
        <div className="max-h-[52vh] min-h-48 overflow-y-auto">
          {assets === null ? (
            <LoadingArea size={40} label="Loading images" />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ImageIcon}
              title={query ? "No matches" : "No images yet"}
              description={query ? "Try a different search." : "Upload an image to add it to your library."}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {filtered.map((a) => {
                const active = selected?.id === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelected(a)}
                    onDoubleClick={() => {
                      onPick(a);
                      close(false);
                    }}
                    aria-pressed={active}
                    className={cn(
                      "group relative overflow-hidden rounded-lg border bg-surface-card text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                      active ? "border-primary" : "border-border hover:border-border-strong",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={a.altText || a.name} className="aspect-square w-full object-cover" loading="lazy" />
                    <span className="block truncate px-2 py-1.5 text-xs text-muted-foreground">{a.name}</span>
                    {active ? (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            disabled={!selected}
            onClick={() => {
              onPick(selected);
              close(false);
            }}
          >
            Use image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AssetPicker;
