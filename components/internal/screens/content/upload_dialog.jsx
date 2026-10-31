"use client";

import React, { useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Loader2, UploadCloud, X } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  cn,
} from "@geiger/ui";
import { uploadAsset } from "@/lib/supabase/assets";
import { getUser } from "@/lib/supabase/user";
import { MAX_UPLOAD_BYTES, formatBytes, parseTags } from "@/lib/content/files";

// Multi-file upload into Storage + campaign.assets, shared by the Asset Library and Files screens.
// Images are compressed under ~500 KB on the way up; each file reports its own result.

const accepts = (file, accept) => {
  if (!accept) return true;
  return accept.split(",").some((rule) => {
    const r = rule.trim();
    if (r.endsWith("/*")) return file.type.startsWith(r.slice(0, -1));
    if (r.startsWith(".")) return file.name.toLowerCase().endsWith(r.toLowerCase());
    return file.type === r;
  });
};

export function UploadDialog({ open, onOpenChange, projectId, onUploaded, title, description, accept = "", acceptLabel = "any file", folders = [], defaultFolder = "", area = "assets" }) {
  const [items, setItems] = useState([]);
  const [folder, setFolder] = useState(defaultFolder);
  const [tags, setTags] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  const reset = () => {
    setItems([]);
    setFolder(defaultFolder);
    setTags("");
  };

  const close = (next) => {
    if (uploading) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const add = (list) => {
    const files = Array.from(list || []);
    const rejected = [];
    const next = [];
    for (const file of files) {
      if (!accepts(file, accept)) rejected.push(`"${file.name}" isn't ${acceptLabel}.`);
      else if (file.size > MAX_UPLOAD_BYTES) rejected.push(`"${file.name}" is over the 25 MB limit.`);
      else next.push({ key: `${file.name}-${file.size}-${file.lastModified}`, file, status: "pending" });
    }
    if (rejected.length) toast.error(rejected[0]);
    setItems((prev) => [...prev, ...next.filter((n) => !prev.some((p) => p.key === n.key))]);
  };

  const setStatus = (key, status) => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, status } : i)));

  const upload = async () => {
    const queue = items.filter((i) => i.status !== "done");
    if (!queue.length) return;
    setUploading(true);
    const user = await getUser().catch(() => null);
    const uploaded = [];
    for (const item of queue) {
      setStatus(item.key, "uploading");
      const asset = await uploadAsset(projectId, item.file, {
        id: crypto.randomUUID(),
        folder: folder.trim(),
        tags: parseTags(tags),
        area,
        createdBy: user?.id ?? null,
      });
      setStatus(item.key, asset ? "done" : "failed");
      if (asset) uploaded.push(asset);
    }
    setUploading(false);
    if (uploaded.length) onUploaded(uploaded);
    const failed = queue.length - uploaded.length;
    if (failed) {
      toast.error(`${failed} of ${queue.length} file${queue.length === 1 ? "" : "s"} couldn't be uploaded. Check your access and try again.`);
      setItems((prev) => prev.filter((i) => i.status !== "done"));
      return;
    }
    toast.success(uploaded.length === 1 ? `Uploaded "${uploaded[0].name}".` : `Uploaded ${uploaded.length} files.`);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={accept || undefined}
            className="hidden"
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              add(e.dataTransfer.files);
            }}
            disabled={uploading}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-background py-8 text-center transition-colors hover:border-border-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              dragging ? "border-border-strong bg-surface-hover" : "border-border",
            )}
          >
            <UploadCloud className="h-6 w-6 text-text-secondary" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Drop files here or click to browse</p>
            <p className="text-xs text-text-secondary">Up to 25 MB each. Images are optimised to under 500 KB.</p>
          </button>

          {items.length ? (
            <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface-card">
              {items.map((item) => (
                <li key={item.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-foreground">{item.file.name}</span>
                  <span className="shrink-0 tabular-nums text-xs text-text-secondary">{formatBytes(item.file.size)}</span>
                  {item.status === "uploading" ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-secondary" aria-label="Uploading" />
                  ) : item.status === "done" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Uploaded" />
                  ) : item.status === "failed" ? (
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-label="Failed" />
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove ${item.file.name}`}
                      onClick={() => setItems((prev) => prev.filter((i) => i.key !== item.key))}
                      disabled={uploading}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Folder" htmlFor="up-folder" hint="Pick one or type a new name.">
              <Input id="up-folder" list="up-folder-options" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Uploads" disabled={uploading} />
              <datalist id="up-folder-options">
                {folders.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </Field>
            <Field label="Tags" htmlFor="up-tags" hint="Comma-separated.">
              <Input id="up-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="autumn, hero" disabled={uploading} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={upload} disabled={uploading || !items.some((i) => i.status !== "done")}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {uploading ? "Uploading…" : items.length > 1 ? `Upload ${items.length} files` : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UploadDialog;
