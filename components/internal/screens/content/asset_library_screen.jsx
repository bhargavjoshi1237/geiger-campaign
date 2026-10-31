"use client";

import React, { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Upload, Image as ImageIcon, FileVideo, FileText, Film, Pencil, TextCursorInput, Download, Link2, Trash2, UploadCloud, HardDrive,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  ScreenHeader,
  SearchInput,
  Toolbar,
  EmptyState,
  ActionMenu,
  Field,
  Badge,
  SectionCard,
  SettingsList,
  SettingRow,
  InlineTitleInput,
} from "@geiger/ui";

const TYPE_META = {
  Image: { icon: ImageIcon, from: "#3b82f6", to: "#1e3a8a", ext: "PNG", badge: "info" },
  GIF: { icon: Film, from: "#ec4899", to: "#831843", ext: "GIF", badge: "warning" },
  Video: { icon: FileVideo, from: "#8b5cf6", to: "#4c1d95", ext: "MP4", badge: "purple" },
  Document: { icon: FileText, from: "#10b981", to: "#064e3b", ext: "PDF", badge: "success" },
};
const TYPES = Object.keys(TYPE_META);
const TYPE_OPTIONS = [{ value: "All", label: "All types" }, ...TYPES.map((t) => ({ value: t, label: t }))];
const FOLDERS = ["Campaigns", "Brand", "Product", "Social"];
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const ASSET_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "Name the file and describe it for screen readers." },
  { key: "file", label: "File", icon: HardDrive, desc: "Format, size, and where the file is hosted." },
];

const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

const cdnUrl = (name) => `https://cdn.geiger.app/assets/${encodeURIComponent(name)}`;

// Sample rows; each gets a CDN URL built from its file name.
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
].map((a) => ({ ...a, url: cdnUrl(a.name) }));

const metaFor = (type) => TYPE_META[type] || TYPE_META.Image;

function typeFromMime(mime = "") {
  if (mime === "image/gif") return "GIF";
  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("video/")) return "Video";
  return "Document";
}

function extFrom(name, type) {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toUpperCase() : metaFor(type).ext;
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function copyUrl(a) {
  if (!a.url) {
    toast.error(`"${a.name}" has no file uploaded yet.`);
    return;
  }
  try {
    await navigator.clipboard.writeText(a.url);
    toast.success("URL copied to clipboard.");
  } catch {
    toast.error("Couldn't copy the URL. Check your browser's clipboard permissions.");
  }
}

// Downloads through a temporary link; cross-origin URLs open in a new tab instead.
function downloadAsset(a) {
  if (!a.url) {
    toast.error(`"${a.name}" has no file uploaded yet.`);
    return;
  }
  const link = document.createElement("a");
  link.href = a.url;
  link.download = a.name;
  link.target = "_blank";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  toast.success(`Downloading "${a.name}"…`);
}

function UploadDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", type: "Image" });
  const [file, setFile] = useState(null);
  const fileRef = useRef(null);

  const reset = () => {
    setForm({ name: "", type: "Image" });
    setFile(null);
  };

  const close = (o) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const pick = (f) => {
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) {
      toast.error(`"${f.name}" is over the 25 MB limit.`);
      return;
    }
    setFile(f);
    setForm({ name: f.name, type: typeFromMime(f.type) });
  };

  const submit = () => {
    const name = form.name.trim();
    if (!name) return;
    onCreate({
      name,
      type: form.type,
      ext: extFrom(name, form.type),
      size: file ? formatSize(file.size) : "0 KB",
      url: file ? URL.createObjectURL(file) : "",
    });
    close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload asset</DialogTitle>
          <DialogDescription>Add an image, GIF, video, or document to your library.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="File name" htmlFor="a-name">
            <Input id="a-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. autumn-hero.png" className="border-border" />
          </Field>
          <Field label="Type">
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pick(e.dataTransfer.files?.[0]);
            }}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background py-10 text-center transition-colors hover:border-border-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <UploadCloud className="h-7 w-7 text-text-secondary" />
            {file ? (
              <>
                <p className="text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-text-secondary">{formatSize(file.size)} · click to choose a different file</p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Drag &amp; drop a file here</p>
                <p className="text-xs text-text-secondary">or click to browse — up to 25 MB</p>
              </>
            )}
          </button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Upload</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Editable slice of an asset row; compared against the row to derive dirty state.
const toDraft = (a) => ({
  name: a.name,
  alt: a.alt ?? "",
  folder: a.folder ?? FOLDERS[0],
});

function AssetEditor({ record, focusName, onBack, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const meta = metaFor(record.type);
  const Icon = meta.icon;

  const save = () => {
    const patch = { ...draft, name: draft.name.trim() || "Untitled asset", alt: draft.alt.trim() };
    onSave(record.id, patch);
    setDraft(toDraft({ ...record, ...patch }));
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="File name"
          placeholder="Untitled asset"
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      badges={
        <>
          <Badge variant={meta.badge}>{record.type}</Badge>
          <span className="text-xs text-text-tertiary">{record.ext} · {record.size}</span>
        </>
      }
      actions={
        <>
          <Button variant="ghost" size="icon" aria-label="Delete asset" className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400" onClick={() => onDelete(record)}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty} onClick={save}>
            Save
          </Button>
        </>
      }
      nav={ASSET_NAV}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard bare title="File details" description="The asset's name, folder and the alt text screen readers announce.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="File name" htmlFor="ae-name">
                  <Input id="ae-name" value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. autumn-hero.png" autoFocus={focusName} />
                </Field>
                <Field label="Folder">
                  <Select value={draft.folder} onValueChange={set("folder")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{FOLDERS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Alt text" htmlFor="ae-alt" hint="Read by screen readers and shown when images are blocked." className="sm:col-span-2">
                  <Textarea id="ae-alt" value={draft.alt} onChange={(e) => set("alt")(e.target.value)} placeholder="Describe what this asset shows" />
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "file" ? (
            <SectionCard>
              <div
                className="mb-5 flex h-48 items-center justify-center rounded-lg"
                style={{ background: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}
              >
                <Icon className="h-10 w-10 text-white/90" />
              </div>
              <SettingsList>
                <SettingRow title="Type" description="The kind of media this asset is." control={<Badge variant={meta.badge}>{record.type}</Badge>} />
                <SettingRow title="Format" description="File extension." control={<span className="text-sm font-medium text-foreground">{record.ext}</span>} />
                <SettingRow title="Size" description="Stored file size." control={<span className="text-sm font-medium tabular-nums text-foreground">{record.size}</span>} />
                <SettingRow
                  title="File URL"
                  description={<span className="break-all">{record.url || "No file uploaded yet."}</span>}
                  control={
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className={OUTLINE_BUTTON} disabled={!record.url} onClick={() => copyUrl(record)}>
                        <Link2 className="h-4 w-4" /> Copy
                      </Button>
                      <Button variant="outline" size="sm" className={OUTLINE_BUTTON} disabled={!record.url} onClick={() => downloadAsset(record)}>
                        <Download className="h-4 w-4" /> Download
                      </Button>
                    </div>
                  }
                />
              </SettingsList>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function AssetLibraryScreen() {
  const [assets, setAssets] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  // Rename lands on Details with the file-name field focused.
  const [focusName, setFocusName] = useState(false);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => (type === "All" || a.type === type) && (!q || a.name.toLowerCase().includes(q)));
  }, [assets, query, type]);

  const openAsset = (id, rename = false) => {
    setFocusName(rename);
    openRecord(String(id));
  };

  const handleUpload = (a) => {
    const id = crypto.randomUUID();
    setAssets((p) => [{ id, ...a }, ...p]);
    toast.success(`Uploaded "${a.name}".`);
    openAsset(id);
  };

  const handleSave = (id, patch) => {
    setAssets((p) => p.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    toast.success("Asset saved.");
  };

  const handleDelete = (a) => {
    setDeleteTarget(null);
    setAssets((p) => p.filter((x) => x.id !== a.id));
    if (a.url?.startsWith("blob:")) URL.revokeObjectURL(a.url);
    if (String(a.id) === recordId) closeRecord();
    toast.success(`Deleted "${a.name}".`);
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete asset</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? Campaigns using it will show a broken file. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button className="bg-red-500/90 text-white hover:bg-red-500" onClick={() => handleDelete(deleteTarget)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const open = assets.find((a) => String(a.id) === recordId);
  if (open) {
    return (
      <>
        <AssetEditor key={open.id} record={open} focusName={focusName} onBack={closeRecord} onSave={handleSave} onDelete={setDeleteTarget} />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || type !== "All";

  // Keys typed inside the tile (e.g. on its action menu) must not open the editor.
  const onTileKey = (e, id) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openAsset(id);
    }
  };

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Asset Library"
        description="All your images and media, ready to drop into campaigns."
        actions={
          <Button onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" /> Upload</Button>
        }
      />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={type} onValueChange={setType} options={TYPE_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search assets…" />
      </Toolbar>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title={filtersActive ? "No assets found" : "No assets yet"}
          description={filtersActive ? "No assets match your filters." : "Upload images, GIFs, videos, or documents to use in campaigns."}
          className="rounded-xl border border-dashed border-border bg-surface-subtle"
          action={
            filtersActive ? (
              <Button
                variant="outline"
                className={OUTLINE_BUTTON}
                onClick={() => {
                  setQuery("");
                  setType("All");
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" /> Upload</Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((a) => {
            const meta = metaFor(a.type);
            const Icon = meta.icon;
            return (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                aria-label={`Edit ${a.name}`}
                onClick={() => openAsset(a.id)}
                onKeyDown={(e) => onTileKey(e, a.id)}
                className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-surface-subtle transition-colors hover:border-border-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <div
                  className="relative flex aspect-video items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}
                >
                  <Icon className="h-9 w-9 text-white/90" />
                  <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
                    <ActionMenu
                      label={`Actions for ${a.name}`}
                      items={[
                        { label: "Edit", icon: Pencil, onSelect: () => openAsset(a.id) },
                        { label: "Rename", icon: TextCursorInput, onSelect: () => openAsset(a.id, true) },
                        { label: "Download", icon: Download, onSelect: () => downloadAsset(a) },
                        { label: "Copy URL", icon: Link2, onSelect: () => copyUrl(a) },
                        { separator: true },
                        { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(a) },
                      ]}
                    />
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

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onCreate={handleUpload} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default AssetLibraryScreen;
