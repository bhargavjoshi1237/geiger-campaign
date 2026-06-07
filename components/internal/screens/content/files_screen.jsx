"use client";

import React, { useMemo, useState } from "react";
import {
  Upload, FileText, FileSpreadsheet, FileImage, File as FileIcon, Download, Pencil, FolderInput, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, SearchInput, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
        <DialogBody className="space-y-4 py-4">
          <Field label="File name" htmlFor="f-name">
            <Input id="f-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. june-recap.pdf" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Folder">
              <Select value={form.folder} onValueChange={(v) => setForm((f) => ({ ...f, folder: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FOLDERS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Upload file</Button>
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

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Files"
        description="Documents and downloadable files used across your campaigns."
        actions={
          <Button onClick={() => setUploadOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]"><Upload className="h-4 w-4" /> Upload file</Button>
        }
      />

      <div className="border-t border-[#242424] pt-4">
        <p className="text-xs text-[#737373]">
          <span className="text-[#a3a3a3]">All files</span> / Campaign Assets
        </p>
      </div>

      <div className="border-t border-[#242424] pt-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search files…" />
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Modified</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((f) => {
              const Icon = TYPE_META[f.type].icon;
              return (
                <TableRow key={f.id} className="border-[#2a2a2a]">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#242424] text-[#a3a3a3]"><Icon className="h-4 w-4" /></span>
                      <span className="font-medium text-[#ededed]">{f.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-[#a3a3a3]">{f.type}</TableCell>
                  <TableCell className="tabular-nums text-[#a3a3a3]">{f.size}</TableCell>
                  <TableCell className="text-[#a3a3a3]">{f.modified}</TableCell>
                  <TableCell className="text-right">
                    <RowActions items={[
                      { label: "Download", icon: Download },
                      { label: "Rename", icon: Pencil },
                      { label: "Move", icon: FolderInput },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setFiles((p) => p.filter((x) => x.id !== f.id)) },
                    ]} />
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                <TableCell colSpan={5} className="py-14 text-center text-sm text-[#737373]">No files found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <UploadFileDialog open={uploadOpen} onOpenChange={setUploadOpen} onCreate={(f) => setFiles((p) => [{ id: Date.now(), ...f }, ...p])} />
    </MainScreenWrapper>
  );
}

export default FilesScreen;
