"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@geiger/ui";
import { listContacts } from "@/lib/supabase/contacts";
import { validateData } from "@/lib/data/fields";

// Searches the project's contacts and picks one; shows the selection as a removable chip.
function ContactPicker({ projectId, value, onChange }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return undefined;
    let alive = true;
    const timer = setTimeout(() => {
      setSearching(true);
      listContacts(projectId, { search: term, limit: 8 }).then((rows) => {
        if (!alive) return;
        setResults(rows ?? []);
        setSearching(false);
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [projectId, query]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface-card px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground">{value.name}</p>
          {value.email && value.email !== value.name ? <p className="truncate text-xs text-text-secondary">{value.email}</p> : null}
        </div>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Unlink contact" onClick={() => onChange(null)} className="text-muted-foreground">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  const term = query.trim();
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email" aria-label="Search contacts" />
        {searching ? <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-text-tertiary" /> : null}
      </div>
      {term.length >= 2 && results.length ? (
        <ul className="max-h-44 overflow-y-auto rounded-md border border-border bg-surface-card py-1">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="flex w-full flex-col px-3 py-1.5 text-left hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
                onClick={() => {
                  onChange({ id: c.id, name: c.name, email: c.email });
                  setQuery("");
                }}
              >
                <span className="truncate text-sm text-foreground">{c.name}</span>
                {c.email && c.email !== c.name ? <span className="truncate text-xs text-text-secondary">{c.email}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : term.length >= 2 && !searching ? (
        <p className="text-xs text-text-secondary">No contacts match “{term}”.</p>
      ) : null}
    </div>
  );
}

function FieldInput({ field, value, onChange }) {
  const id = `rec-${field.key}`;
  if (field.type === "boolean") {
    return (
      <div className="flex h-9 items-center">
        <Switch id={id} checked={value === true || value === "true"} onCheckedChange={onChange} aria-label={field.label} />
      </div>
    );
  }
  if (field.type === "select") {
    return (
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full"><SelectValue placeholder="Choose…" /></SelectTrigger>
        <SelectContent>{(field.options || []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    );
  }
  const type = { number: "number", date: "date", url: "url", email: "email" }[field.type] || "text";
  return <Input id={id} type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
}

// Create / edit one record or item: its external id, optional contact link and every schema field.
export function RecordDialog({ open, onOpenChange, title, description, fields, record, idLabel = "External ID", idRequired = false, withContact = false, projectId, onSave }) {
  const [externalId, setExternalId] = useState(record?.externalId ?? "");
  const [contact, setContact] = useState(record?.contact ?? null);
  const [values, setValues] = useState(record?.data ?? {});
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setValues((v) => ({ ...v, [key]: value }));

  const submit = async () => {
    if (idRequired && !externalId.trim()) {
      toast.error(`${idLabel} is required.`);
      return;
    }
    const { data, errors } = validateData(fields, values);
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }
    setSaving(true);
    const ok = await onSave({ externalId: externalId.trim(), contactId: contact?.id ?? null, contact, data });
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="grid gap-4">
          <Field label={idLabel} htmlFor="rec-external-id" hint={idRequired ? "Your system's id; imports and the API update the item with this id." : "Optional. Imports and the API update the record with this id."}>
            <Input id="rec-external-id" value={externalId} onChange={(e) => setExternalId(e.target.value)} className="font-mono text-sm" />
          </Field>
          {withContact ? (
            <Field label="Contact" hint="The contact this record belongs to.">
              <ContactPicker projectId={projectId} value={contact} onChange={setContact} />
            </Field>
          ) : null}
          {fields.map((field) => (
            <Field key={field.key} label={`${field.label}${field.required ? " *" : ""}`} htmlFor={`rec-${field.key}`}>
              <FieldInput field={field} value={values[field.key]} onChange={set(field.key)} />
            </Field>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RecordDialog;
