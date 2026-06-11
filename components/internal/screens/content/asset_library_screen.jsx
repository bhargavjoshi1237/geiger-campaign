"use client";

import React, { useMemo, useState } from "react";
import {
  Upload, Image as ImageIcon, FileVideo, FileText, Film, Pencil, Download, Link2, Trash2, UploadCloud,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { SearchInput, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const TYPE_META = {
  Image: { icon: ImageIcon, from: "#3b82f6", to: "#1e3a8a", ext: "PNG" },
  GIF: { icon: Film, from: "#ec4899", to: "#831843", ext: "GIF" },
  Video: { icon: FileVideo, from: "#8b5cf6", to: "#4c1d95", ext: "MP4" },
  Document: { icon: FileText, from: "#10b981", to: "#064e3b", ext: "PDF" },
};
const TYPES = Object.keys(TYPE_META);

const INITIAL = [
  { id: 1, name: "summer-sale-hero.png", type: "Image", ext: "PNG", size: "248 KB" },
  { id: 2, name: "welcome-banner.jpg", type: "Image", ext: "JPG", size: "512 KB" },
  { id: 3, name: "product-spin.gif", type: "GIF", ext: "GIF", size: "1.4 MB" },
  { id: 4, name: "launch-teaser.mp4", type: "Video", ext: "MP4", size: "8.2 MB" },
  { id: 5, name: "logo-light.svg", type: "Image", ext: "SVG", size: "14 KB" },
  { id: 6, name: "spring-lookbook.pdf", type: "Document", ext: "PDF", size: "3.1 MB" },
  { id: 7, name: "cart-reminder.png", type: "Image", ext: "PNG", size: "186 KB" },
  { id: 8, name: "confetti-loop.gif", type: "GIF", ext: "GIF", size: "920 KB" },
  { id: 9, name: "founder-letter.png", type: "Image", ext: "PNG", size: "402 KB" },
  { id: 10, name: "feature-walkthrough.mp4", type: "Video", ext: "MP4", size: "12.6 MB" },
];

function UploadDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", type: "Image" });
  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({ name: form.name.trim(), type: form.type, ext: TYPE_META[form.type].ext, size: "0 KB" });
    setForm({ name: "", type: "Image" });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload asset</DialogTitle>
          <DialogDescription>Add an image, GIF, video, or document to your library.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="File name" htmlFor="a-name">
            <Input id="a-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. autumn-hero.png" className="bg-background border-border" />
          </Field>
          <Field label="Type">
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background py-10 text-center">
            <UploadCloud className="h-7 w-7 text-text-secondary" />
            <p className="text-sm text-muted-foreground">Drag &amp; drop a file here</p>
            <p className="text-xs text-text-secondary">or click to browse — up to 25 MB</p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Upload</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AssetLibraryScreen() {
  const [assets, setAssets] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const [uploadOpen, setUploadOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => (type === "All" || a.type === type) && (!q || a.name.toLowerCase().includes(q)));
  }, [assets, query, type]);

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Asset Library"
        description="All your images and media, ready to drop into campaigns."
        actions={
          <Button onClick={() => setUploadOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]"><Upload className="h-4 w-4" /> Upload</Button>
        }
      />

      <div className="flex flex-col gap-3 border-t border-surface-active pt-4 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search assets…" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 justify-between border-border bg-surface-card text-foreground hover:bg-surface-subtle sm:w-40">
              {type === "All" ? "All types" : type}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 border-border bg-surface-card text-foreground">
            <DropdownMenuLabel className="text-text-secondary">Filter by type</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-surface-hover" />
            {["All", ...TYPES].map((t) => (
              <DropdownMenuItem key={t} onSelect={() => setType(t)} className={cn("cursor-pointer focus:bg-surface-hover focus:text-foreground", type === t && "text-white")}>
                {t === "All" ? "All types" : t}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-subtle py-16 text-center text-sm text-text-secondary">
          No assets match your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((a) => {
            const meta = TYPE_META[a.type];
            const Icon = meta.icon;
            return (
              <div key={a.id} className="group overflow-hidden rounded-xl border border-border bg-surface-subtle transition-colors hover:border-border-strong">
                <div
                  className="relative flex aspect-video items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}
                >
                  <Icon className="h-9 w-9 text-white/90" />
                  <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <RowActions items={[
                      { label: "Rename", icon: Pencil },
                      { label: "Download", icon: Download },
                      { label: "Copy URL", icon: Link2 },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setAssets((p) => p.filter((x) => x.id !== a.id)) },
                    ]} />
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="truncate font-medium text-foreground">{a.name}</h3>
                  <p className="mt-1 text-xs text-text-secondary">{a.ext} · {a.size}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onCreate={(a) => setAssets((p) => [{ id: Date.now(), ...a }, ...p])} />
    </MainScreenWrapper>
  );
}

export default AssetLibraryScreen;
