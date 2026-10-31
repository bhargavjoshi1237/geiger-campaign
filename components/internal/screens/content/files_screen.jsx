"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Upload, FileText, FileSpreadsheet, FileImage, File as FileIcon, Download, Pencil, FolderInput, Trash2, Info,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
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
  ScreenHeader,
  StatsBar,
  SearchInput,
  Toolbar,
  DataTable,
  EmptyState,
  Badge,
  ActionMenu,
  Field,
  InlineTitleInput,
  SectionCard,
  SettingsList,
  SettingRow,
} from "@geiger/ui";

const TYPE_META = {
  PDF: { icon: FileText },
  CSV: { icon: FileSpreadsheet },
  Image: { icon: FileImage },
  Archive: { icon: FileIcon },
};
const TYPES = Object.keys(TYPE_META);
const FOLDERS = ["Campaign Assets", "Reports", "Legal", "Imports"];

const TYPE_FILTER_OPTIONS = [{ value: "all", label: "All types" }, ...TYPES.map((t) => ({ value: t, label: t }))];
const FOLDER_FILTER_OPTIONS = [{ value: "all", label: "All folders" }, ...FOLDERS.map((f) => ({ value: f, label: f }))];

const INITIAL = [
  { id: 1, name: "Q2-campaign-report.pdf", type: "PDF", folder: "Reports", size: "1.2 MB", modified: "2026-06-04" },
  { id: 2, name: "subscriber-export.csv", type: "CSV", folder: "Imports", size: "486 KB", modified: "2026-06-02" },
  { id: 3, name: "summer-creative-pack.zip", type: "Archive", folder: "Campaign Assets", size: "14.8 MB", modified: "2026-05-28" },
  { id: 4, name: "hero-banner-final.png", type: "Image", folder: "Campaign Assets", size: "742 KB", modified: "2026-05-27" },
  { id: 5, name: "unsubscribe-policy.pdf", type: "PDF", folder: "Legal", size: "210 KB", modified: "2026-05-20" },
  { id: 6, name: "segment-performance.csv", type: "CSV", folder: "Reports", size: "98 KB", modified: "2026-05-18" },
  { id: 7, name: "brand-guidelines-v3.pdf", type: "PDF", folder: "Campaign Assets", size: "3.6 MB", modified: "2026-05-11" },
  { id: 8, name: "product-shots.zip", type: "Archive", folder: "Campaign Assets", size: "22.1 MB", modified: "2026-05-06" },
];

const FILE_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "The file's name and the folder it lives in." },
  { key: "info", label: "File info", icon: Info, desc: "Type, size, and when it last changed." },
];

const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

const EMPTY_FORM = { name: "", type: "PDF", folder: FOLDERS[0] };

const SIZE_UNITS = { KB: 1, MB: 1024, GB: 1024 * 1024 };

// "1.2 MB" -> kilobytes, so sizes can be summed.
const toKb = (size) => {
  const [n, unit] = String(size).split(" ");
  return (Number(n) || 0) * (SIZE_UNITS[unit] ?? 0);
};

function formatKb(kb) {
  if (kb >= SIZE_UNITS.GB) return `${(kb / SIZE_UNITS.GB).toFixed(1)} GB`;
  if (kb >= SIZE_UNITS.MB) return `${(kb / SIZE_UNITS.MB).toFixed(1)} MB`;
  return `${Math.round(kb)} KB`;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const today = () => new Date().toISOString().slice(0, 10);

function UploadFileDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) {
      toast.error("Give the file a name.");
      return;
    }
    onCreate({ name: form.name.trim(), type: form.type, folder: form.folder, size: "0 KB", modified: today() });
    setForm(EMPTY_FORM);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload file</DialogTitle>
          <DialogDescription>Add a document or file to your campaign workspace.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="File name" htmlFor="f-name">
            <Input
              id="f-name"
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="e.g. june-recap.pdf"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Type">
              <Select value={form.type} onValueChange={set("type")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Folder">
              <Select value={form.folder} onValueChange={set("folder")}>
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

// Remounted per file (keyed by id) so the picker starts on that file's folder.
function MoveFileDialog({ file, onOpenChange, onMove }) {
  const [folder, setFolder] = useState(file?.folder ?? FOLDERS[0]);

  return (
    <Dialog open={!!file} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move file</DialogTitle>
          <DialogDescription>
            Choose a new folder for <span className="font-medium text-foreground">{file?.name}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Folder">
            <Select value={folder} onValueChange={setFolder}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{FOLDERS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onMove(file, folder)} disabled={folder === file?.folder}>Move file</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Editable slice of a file row; compared against the row to derive dirty state.
const toDraft = (f) => ({ name: f.name, folder: f.folder });

function FileEditor({ record, onBack, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));

  const save = () => {
    if (!draft.name.trim()) {
      toast.error("A file needs a name.");
      return;
    }
    const patch = { ...draft, name: draft.name.trim(), modified: today() };
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
          placeholder="Untitled file"
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      badges={
        <>
          <Badge variant="neutral">{record.type}</Badge>
          <span className="text-xs text-text-tertiary">{record.size} · {record.folder}</span>
        </>
      }
      actions={
        <>
          <Button variant="ghost" size="icon" aria-label="Delete file" className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400" onClick={() => onDelete(record)}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty} onClick={save}>
            Save
          </Button>
        </>
      }
      nav={FILE_NAV}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard bare title="File details" description="The name your team sees and the folder it's filed under.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="File name" htmlFor="fe-name" hint="Include the extension, e.g. june-recap.pdf.">
                  <Input id="fe-name" value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. june-recap.pdf" />
                </Field>
                <Field label="Folder">
                  <Select value={draft.folder} onValueChange={set("folder")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{FOLDERS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "info" ? (
            <SectionCard bare title="Stored file" description="What was uploaded, how big it is and when it last changed.">
              <SettingsList>
                <SettingRow title="Type" description="Detected from the uploaded file." control={<Badge variant="neutral">{record.type}</Badge>} />
                <SettingRow
                  title="Size"
                  description="Storage used by this file."
                  control={<span className="text-sm font-semibold tabular-nums text-foreground">{record.size}</span>}
                />
                <SettingRow
                  title="Modified"
                  description="When the file was last uploaded or changed."
                  control={<span className="text-sm text-muted-foreground">{formatDate(record.modified)}</span>}
                />
              </SettingsList>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function FilesScreen() {
  const [files, setFiles] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [folderFilter, setFolderFilter] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter((f) => {
      if (typeFilter !== "all" && f.type !== typeFilter) return false;
      if (folderFilter !== "all" && f.folder !== folderFilter) return false;
      if (q && !f.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [files, query, typeFilter, folderFilter]);

  const stats = useMemo(() => {
    const totalKb = files.reduce((s, f) => s + toKb(f.size), 0);
    const folders = new Set(files.map((f) => f.folder)).size;
    return [
      { label: "Files", value: files.length.toLocaleString("en-US") },
      { label: "Total size", value: formatKb(totalKb) },
      { label: "Folders", value: folders.toLocaleString("en-US") },
    ];
  }, [files]);

  const pager = usePagination(filtered, { resetKey: `${query}|${typeFilter}|${folderFilter}` });

  const handleCreate = (f) => {
    const id = crypto.randomUUID();
    setFiles((p) => [{ id, ...f }, ...p]);
    openRecord(id);
  };

  const handleSave = (id, patch) => {
    setFiles((p) => p.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    toast.success("File saved.");
  };

  const handleMove = (file, folder) => {
    setMoveTarget(null);
    setFiles((p) => p.map((f) => (f.id === file.id ? { ...f, folder, modified: today() } : f)));
    toast.success(`Moved ${file.name} to ${folder}.`);
  };

  const handleDelete = (f) => {
    setDeleteTarget(null);
    setFiles((p) => p.filter((x) => x.id !== f.id));
    if (String(f.id) === recordId) closeRecord();
    toast.success(`Deleted ${f.name}.`);
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete file</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? Campaigns linking to it will lose the download. This can&apos;t be undone.
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

  const open = files.find((f) => String(f.id) === recordId);
  if (open) {
    return (
      <>
        <FileEditor key={open.id} record={open} onBack={closeRecord} onSave={handleSave} onDelete={setDeleteTarget} />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || typeFilter !== "all" || folderFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setTypeFilter("all");
    setFolderFilter("all");
  };

  const columns = [
    {
      key: "name",
      header: "Name",
      render: (f) => {
        const Icon = TYPE_META[f.type]?.icon ?? FileIcon;
        return (
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
              <Icon className="h-4 w-4" />
            </span>
            <span className="font-medium text-foreground">{f.name}</span>
          </div>
        );
      },
    },
    { key: "type", header: "Type", render: (f) => <Badge variant="neutral">{f.type}</Badge> },
    { key: "folder", header: "Folder", className: "whitespace-nowrap text-muted-foreground" },
    { key: "size", header: "Size", className: "whitespace-nowrap tabular-nums text-muted-foreground" },
    { key: "modified", header: "Modified", className: "whitespace-nowrap text-muted-foreground", render: (f) => formatDate(f.modified) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (f) => (
        <ActionMenu
          label={`Actions for ${f.name}`}
          items={[
            { label: "Download", icon: Download, onSelect: () => toast.success(`Downloading ${f.name}…`) },
            { label: "Rename", icon: Pencil, onSelect: () => openRecord(String(f.id)) },
            { label: "Move", icon: FolderInput, onSelect: () => setMoveTarget(f) },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(f) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Files"
        description="Documents and downloadable files used across your campaigns."
        actions={
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4" /> Upload file
          </Button>
        }
      />

      <StatsBar stats={stats} columns={3} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={typeFilter} onValueChange={setTypeFilter} options={TYPE_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={folderFilter} onValueChange={setFolderFilter} options={FOLDER_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search files…" />
      </Toolbar>

      <div className="space-y-5">
        <DataTable
          columns={columns}
          data={pager.pageItems}
          getRowKey={(f) => f.id}
          onRowClick={(f) => openRecord(String(f.id))}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={FileIcon}
                title={filtersActive ? "No matches" : "No files yet"}
                description={filtersActive ? "Try a different search or filter." : "Upload a document to share it across your campaigns."}
                action={
                  filtersActive ? (
                    <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : (
                    <Button onClick={() => setUploadOpen(true)}>
                      <Upload className="h-4 w-4" /> Upload file
                    </Button>
                  )
                }
              />
            </div>
          }
        />
        <ListPagination {...pager} itemLabel="files" />
      </div>

      <UploadFileDialog open={uploadOpen} onOpenChange={setUploadOpen} onCreate={handleCreate} />
      <MoveFileDialog key={moveTarget?.id ?? "none"} file={moveTarget} onOpenChange={(o) => !o && setMoveTarget(null)} onMove={handleMove} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default FilesScreen;
