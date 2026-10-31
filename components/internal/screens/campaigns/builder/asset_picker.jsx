"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ImageIcon } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  Input,
  LoadingArea,
  SearchInput,
  cn,
} from "@geiger/ui";
import { listAssets } from "@/lib/supabase/assets";

// Body of the picker; mounted only while open so every open refetches the library.
function AssetPickerBody({ projectId, onPick, onClose }) {
  const [assets, setAssets] = useState(null);
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    let alive = true;
    listAssets(projectId, { kind: "image" }).then((rows) => {
      if (alive) setAssets(rows ?? []);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (assets || []).filter((a) => a.url && (!q || `${a.name} ${(a.tags || []).join(" ")}`.toLowerCase().includes(q)));
  }, [assets, query]);

  const validUrl = /^https?:\/\/\S+$/i.test(url.trim());

  return (
    <>
      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">From your asset library</p>
          <SearchInput value={query} onChange={setQuery} placeholder="Search images…" />
        </div>
        {assets === null ? (
          <LoadingArea size={40} label="Loading images" panel />
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-subtle">
            <EmptyState
              icon={ImageIcon}
              title={query ? "No matches" : "No images yet"}
              description={query ? "Try a different search." : "Upload images in Content → Asset Library, or paste a URL below."}
            />
          </div>
        ) : (
          <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
            {filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onPick({ src: a.url, alt: a.altText || "" })}
                className="group overflow-hidden rounded-lg border border-border bg-surface-card text-left transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.altText || a.name} className="aspect-square w-full object-cover" loading="lazy" />
                <span className="block truncate px-2 py-1.5 text-xs text-text-secondary group-hover:text-foreground">{a.name}</span>
              </button>
            ))}
          </div>
        )}
        <Field label="Or paste an image URL" htmlFor="asset-url" hint="Use an absolute https:// link to a hosted image.">
          <Input id="asset-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </Field>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={!validUrl} onClick={() => onPick({ src: url.trim() })}>Use URL</Button>
      </DialogFooter>
    </>
  );
}

export function AssetPickerDialog({ open, onOpenChange, projectId, onPick }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose an image</DialogTitle>
          <DialogDescription>Pick from the asset library or link to an image hosted elsewhere.</DialogDescription>
        </DialogHeader>
        {open ? (
          <AssetPickerBody
            projectId={projectId}
            onClose={() => onOpenChange(false)}
            onPick={(picked) => {
              onPick(picked);
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// URL input with a library picker and a small preview.
export function ImageField({ id, label, hint, value, onChange, onPickAlt, projectId, disabled, className }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Field label={label} htmlFor={id} hint={hint}>
        <div className="flex items-center gap-2">
          <Input id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="https://…" disabled={disabled} />
          <Button type="button" variant="outline" className="shrink-0 bg-surface-card" onClick={() => setOpen(true)} disabled={disabled || !projectId}>
            Choose
          </Button>
        </div>
      </Field>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="max-h-24 w-auto self-start rounded-md border border-border bg-surface-card object-contain" />
      ) : null}
      <AssetPickerDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        onPick={(picked) => {
          onChange(picked.src);
          if (picked.alt && onPickAlt) onPickAlt(picked.alt);
        }}
      />
    </div>
  );
}

export default AssetPickerDialog;
