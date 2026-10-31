"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Crop, Download, FileText, HardDrive, Link2, Loader2, Trash2 } from "lucide-react";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import { Badge, Button, Field, InlineTitleInput, Input, SectionCard, SettingRow, SettingsList, Textarea } from "@geiger/ui";
import { ASSET_KIND_LABEL, formatBytes, formatLabel, parseTags } from "@/lib/content/files";
import { DESTRUCTIVE_ICON_BUTTON, OUTLINE_BUTTON, formatDate } from "../acquisition/constants";
import { copyText } from "../acquisition/shared";
import { AssetThumb, KIND_TONE } from "./asset_thumb";

// Record editor for one campaign.assets row, shared by the Asset Library and Files screens: details
// (name, folder, tags, alt text) and the stored file (preview, format, size, public URL).

const ASSET_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "Name, folder and tags for finding it later, and alt text for screen readers." },
  { key: "file", label: "File", icon: HardDrive, desc: "The stored file, its format and the public URL campaigns use." },
];

// Images the canvas editor can open (animated GIFs and vectors would lose what makes them what they are).
export const EDITABLE_IMAGE = (a) => a?.kind === "image" && !/gif|svg/i.test(a.mime || "");

export async function copyAssetUrl(a) {
  if (!a?.url) {
    toast.error(`"${a?.name}" has no stored file.`);
    return;
  }
  await copyText(a.url, "File URL copied.");
}

// Saves through a blob so the browser keeps the file name; falls back to opening the public URL.
export async function downloadAsset(a) {
  if (!a?.url) {
    toast.error(`"${a?.name}" has no stored file.`);
    return;
  }
  try {
    const res = await fetch(a.url);
    if (!res.ok) throw new Error(String(res.status));
    const url = URL.createObjectURL(await res.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = a.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch {
    window.open(a.url, "_blank", "noopener");
  }
}

const toDraft = (a) => ({ name: a.name, folder: a.folder, tags: a.tags.join(", "), altText: a.altText });

export function AssetEditor({ record, folders = [], canEdit, onBack, onSave, onDelete, onEditImage }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const media = record.kind === "image" || record.kind === "video";

  const save = async () => {
    const patch = { name: draft.name.trim() || "Untitled asset", folder: draft.folder.trim(), tags: parseTags(draft.tags), altText: draft.altText.trim() };
    setSaving(true);
    const ok = await onSave(record.id, patch);
    setSaving(false);
    if (ok) setDraft(toDraft({ ...record, ...patch }));
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
          disabled={!canEdit}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      badges={
        <>
          <Badge variant={KIND_TONE[record.kind] || "neutral"}>{ASSET_KIND_LABEL[record.kind] || record.kind}</Badge>
          <span className="text-xs text-text-tertiary">
            {formatLabel(record.name, record.mime)} · {formatBytes(record.size)}
            {record.folder ? ` · ${record.folder}` : ""}
          </span>
        </>
      }
      actions={
        <>
          {canEdit ? (
            <Button variant="ghost" size="icon" aria-label="Delete file" className={DESTRUCTIVE_ICON_BUTTON} onClick={() => onDelete(record)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
          {onEditImage && EDITABLE_IMAGE(record) ? (
            <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => onEditImage(record)}>
              <Crop className="h-4 w-4" /> Edit image
            </Button>
          ) : null}
          {canEdit ? (
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
          ) : null}
        </>
      }
      nav={ASSET_NAV}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard bare title="Asset details" description="How the asset is named, filed and tagged, plus alt text for media.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="File name" htmlFor="ae-name">
                  <Input id="ae-name" value={draft.name} onChange={(e) => set("name")(e.target.value)} disabled={!canEdit} />
                </Field>
                <Field label="Folder" htmlFor="ae-folder" hint="Pick one or type a new name.">
                  <Input id="ae-folder" list="ae-folder-options" value={draft.folder} onChange={(e) => set("folder")(e.target.value)} placeholder="Uploads" disabled={!canEdit} />
                  <datalist id="ae-folder-options">
                    {folders.map((f) => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Tags" htmlFor="ae-tags" hint="Comma-separated. Searchable in the library and the image picker." className="sm:col-span-2">
                  <Input id="ae-tags" value={draft.tags} onChange={(e) => set("tags")(e.target.value)} placeholder="autumn, hero" disabled={!canEdit} />
                </Field>
                {media ? (
                  <Field label="Alt text" htmlFor="ae-alt" hint="Read by screen readers and shown when images are blocked. Used when the asset is placed in emails and pages." className="sm:col-span-2">
                    <Textarea id="ae-alt" rows={3} value={draft.altText} onChange={(e) => set("altText")(e.target.value)} placeholder="Describe what the image shows" disabled={!canEdit} />
                  </Field>
                ) : null}
              </div>
            </SectionCard>
          ) : null}

          {active === "file" ? (
            <SectionCard>
              {media ? (
                <div className="mb-5 overflow-hidden rounded-lg border border-border bg-background">
                  <AssetThumb asset={record} className="max-h-[420px] w-full object-contain" controls />
                </div>
              ) : null}
              <SettingsList>
                <SettingRow title="Format" description={record.mime || "Unknown type"} control={<span className="text-sm font-medium text-foreground">{formatLabel(record.name, record.mime)}</span>} />
                {record.width && record.height ? (
                  <SettingRow title="Dimensions" description="Pixel size of the stored file." control={<span className="text-sm font-medium tabular-nums text-foreground">{record.width} × {record.height}</span>} />
                ) : null}
                <SettingRow title="Size" description="Stored file size, after optimisation." control={<span className="text-sm font-medium tabular-nums text-foreground">{formatBytes(record.size)}</span>} />
                <SettingRow title="Uploaded" description="When it was added to the workspace." control={<span className="text-sm text-muted-foreground">{formatDate(record.createdAt, { time: true })}</span>} />
                <SettingRow
                  title="Public URL"
                  description={<span className="break-all font-mono text-xs">{record.url || "No stored file."}</span>}
                  control={
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className={OUTLINE_BUTTON} disabled={!record.url} onClick={() => copyAssetUrl(record)}>
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

export default AssetEditor;
