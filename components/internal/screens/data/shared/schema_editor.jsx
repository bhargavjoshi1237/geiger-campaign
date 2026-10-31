"use client";

import React from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  RadioGroup,
  RadioGroupItem,
} from "@geiger/ui";
import { FIELD_TYPES, toKey } from "@/lib/data/fields";
import { DANGER_ICON_BUTTON, OUTLINE_BUTTON } from "./format";

// Field schema editor for custom objects and catalogs. Saved fields keep their key (records reference it);
// fields added in this session derive their key from the label until saved. `fields` items may carry a
// transient `isNew` flag, which sanitizeFields() drops on save.
export function SchemaEditor({ fields, onChange, primaryField, onPrimaryChange, readOnly = false }) {
  const update = (index, patch) => onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  const remove = (index) => onChange(fields.filter((_, i) => i !== index));
  const add = () => {
    const taken = new Set(fields.map((f) => f.key));
    let key = "new_field";
    for (let n = 2; taken.has(key); n += 1) key = `new_field_${n}`;
    onChange([...fields, { key, label: "", type: "text", required: false, isNew: true }]);
  };

  return (
    <div className="space-y-3">
      {fields.length ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="hidden grid-cols-[28px_1.4fr_1fr_140px_88px_36px] gap-3 border-b border-border bg-surface-card px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary md:grid">
            <span className="sr-only">Primary</span>
            <span>Label</span>
            <span>Key</span>
            <span>Type</span>
            <span>Required</span>
            <span />
          </div>
          <RadioGroup value={primaryField || ""} onValueChange={onPrimaryChange} className="gap-0 divide-y divide-border">
            {fields.map((field, index) => (
              <div key={`${field.key}-${index}`} className="grid grid-cols-1 items-center gap-2 px-3 py-2.5 md:grid-cols-[28px_1.4fr_1fr_140px_88px_36px] md:gap-3">
                <RadioGroupItem value={field.key} aria-label={`Use ${field.label || field.key} as the primary field`} disabled={readOnly || !onPrimaryChange} />
                <Input
                  value={field.label}
                  disabled={readOnly}
                  aria-label="Field label"
                  placeholder="Field label"
                  onChange={(e) => update(index, field.isNew ? { label: e.target.value, key: toKey(e.target.value, `field_${index + 1}`) } : { label: e.target.value })}
                />
                <Input
                  value={field.key}
                  disabled={readOnly || !field.isNew}
                  aria-label="Field key"
                  className="font-mono text-xs"
                  onChange={(e) => update(index, { key: toKey(e.target.value, `field_${index + 1}`) })}
                />
                <Select value={field.type} onValueChange={(type) => update(index, { type })} disabled={readOnly}>
                  <SelectTrigger className="w-full" aria-label="Field type"><SelectValue /></SelectTrigger>
                  <SelectContent>{FIELD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Switch checked={Boolean(field.required)} onCheckedChange={(required) => update(index, { required })} disabled={readOnly} aria-label={`${field.label || field.key} is required`} />
                </div>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${field.label || field.key}`} className={DANGER_ICON_BUTTON} disabled={readOnly} onClick={() => remove(index)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                {field.type === "select" ? (
                  <Input
                    className="md:col-span-4 md:col-start-2"
                    disabled={readOnly}
                    aria-label="Options"
                    placeholder="Options, separated by commas"
                    value={(field.options || []).join(", ")}
                    onChange={(e) => update(index, { options: e.target.value.split(",").map((o) => o.trimStart()) })}
                  />
                ) : null}
              </div>
            ))}
          </RadioGroup>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-surface-card px-4 py-6 text-center text-sm text-text-secondary">No fields yet. Add the first one to start storing data.</p>
      )}
      {!readOnly ? (
        <Button type="button" variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={add}>
          <Plus className="h-3.5 w-3.5" /> Add field
        </Button>
      ) : null}
      {onPrimaryChange ? <p className="text-xs text-text-secondary">The selected field labels each record in lists and pickers.</p> : null}
    </div>
  );
}

export default SchemaEditor;
