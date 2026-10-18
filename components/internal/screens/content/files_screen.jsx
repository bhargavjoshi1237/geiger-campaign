"use client";

import React, { useMemo, useState } from "react";
import {
  Upload, FileText, FileSpreadsheet, FileImage, File as FileIcon, Download, Pencil, FolderInput, Trash2,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
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
  ScreenHeader,
  SearchInput,
  Toolbar,
  DataTable,
  EmptyState,
  ActionMenu,
  Field,
} from "@geiger/ui";

const TYPE_META = {
  PDF: { icon: FileText },
  CSV: { icon: FileSpreadsheet },
  Image: { icon: FileImage },
  Archive: { icon: FileIcon },
};
const TYPES = Object.keys(TYPE_META);
const FOLDERS = ["Campaign Assets", "Reports", "Legal", "Imports"];

const INITIAL = [
  { id: 1, name: "Q2-campaign-report.pdf", type: "PDF", size: "1.2 MB", modified: "Jun 4, 2026" },
  { id: 2, name: "subscriber-export.csv", type: "CSV", size: "486 KB", modified: "Jun 2, 2026" },
  { id: 3, name: "summer-creative-pack.zip", type: "Archive", size: "14.8 MB", modified: "May 28, 2026" },
  { id: 4, name: "hero-banner-final.png", type: "Image", size: "742 KB", modified: "May 27, 2026" },
  { id: 5, name: "unsubscribe-policy.pdf", type: "PDF", size: "210 KB", modified: "May 20, 2026" },
  { id: 6, name: "segment-performance.csv", type: "CSV", size: "98 KB", modified: "May 18, 2026" },
  { id: 7, name: "brand-guidelines-v3.pdf", type: "PDF", size: "3.6 MB", modified: "May 11, 2026" },
  { id: 8, name: "product-shots.zip", type: "Archive", size: "22.1 MB", modified: "May 6, 2026" },
];

function UploadFileDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", type: "PDF", folder: FOLDERS[0] });
  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({ name: form.name.trim(), type: form.type, size: "0 KB", modified: "Jun 7, 2026" });
    setForm({ name: "", type: "PDF", folder: FOLDERS[0] });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload file</DialogTitle>
          <DialogDescription>Add a document or file to your campaign workspace.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="File name" htmlFor="f-name">
            <Input id="f-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. june-recap.pdf" className="border-border" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Folder">
              <Select value={form.folder} onValueChange={(v) => setForm((f) => ({ ...f, folder: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{FOLDERS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Upload file</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FilesScreen() {
  const [files, setFiles] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter((f) => !q || f.name.toLowerCase().includes(q) || f.type.toLowerCase().includes(q));
  }, [files, query]);

  const columns = [
    {
      key: "name",
      header: "Name",
      render: (f) => {
        const Icon = TYPE_META[f.type].icon;
        return (
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground"><Icon className="h-4 w-4" /></span>
            <span className="font-medium text-foreground">{f.name}</span>
          </div>
        );
      },
    },
    { key: "type", header: "Type", className: "text-muted-foreground", render: (f) => f.type },
    { key: "size", header: "Size", className: "tabular-nums text-muted-foreground", render: (f) => f.size },
    { key: "modified", header: "Modified", className: "text-muted-foreground", render: (f) => f.modified },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (f) => (
        <ActionMenu items={[
          { label: "Download", icon: Download },
          { label: "Rename", icon: Pencil },
          { label: "Move", icon: FolderInput },
          { separator: true },
          { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setFiles((p) => p.filter((x) => x.id !== f.id)) },
        ]} />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Files"
        description="Documents and downloadable files used across your campaigns."
        actions={
          <Button onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" /> Upload file</Button>
        }
      />

      <Toolbar>
        <p className="text-xs text-text-secondary">
          <span className="text-muted-foreground">All files</span> / Campaign Assets
        </p>
        <SearchInput value={query} onChange={setQuery} placeholder="Search files…" />
      </Toolbar>

      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(f) => f.id}
        empty={
          <EmptyState
            icon={FileIcon}
            title="No files found"
            className="rounded-xl border border-border bg-surface-subtle"
            action={<Button variant="outline" onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" /> Upload file</Button>}
          />
        }
      />

      <UploadFileDialog open={uploadOpen} onOpenChange={setUploadOpen} onCreate={(f) => setFiles((p) => [{ id: Date.now(), ...f }, ...p])} />
    </MainScreenWrapper>
  );
}

export default FilesScreen;
