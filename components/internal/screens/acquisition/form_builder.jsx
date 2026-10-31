"use client";

import React, { useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  cn,
} from "@geiger/ui";
import {
  CONSENT_CHANNELS,
  FIELD_TYPES,
  FIELD_TYPE_LABEL,
  HIDDEN_PARAMS,
  RESERVED_KEYS,
  TEXT_TARGETS,
  newField,
  slugKey,
  uniqueKey,
} from "@/lib/acquisition/fields";

// The form field builder: an ordered list of field cards, one expanded at a time for editing.

function targetOf(field) {
  if (field.key === "first_name" || field.key === "last_name") return field.key;
  return "attribute";
}

function FieldEditor({ field, fields, onChange, disabled }) {
  const set = (key) => (value) => onChange({ ...field, [key]: value });
  const idp = `fb-${field.id}`;
  // A custom field's key follows its label until someone edits the key by hand.
  const setLabel = (label) => {
    const next = { ...field, label };
    if (targetOf(field) === "attribute" && ["text", "textarea", "select", "checkbox"].includes(field.type) && !field.keyEdited) {
      const base = slugKey(label);
      next.key = uniqueKey(RESERVED_KEYS.has(base) ? `${base}_field` : base, fields, field.id);
    }
    onChange(next);
  };
  const setTarget = (target) => {
    if (target !== "attribute") return onChange({ ...field, key: target, keyEdited: false });
    const base = slugKey(field.label);
    onChange({ ...field, key: uniqueKey(RESERVED_KEYS.has(base) ? "custom_field" : base, fields, field.id), keyEdited: false });
  };

  return (
    <div className="grid gap-4 border-t border-border px-4 py-4 sm:grid-cols-2">
      {field.type !== "hidden" ? (
        <Field label={field.type === "consent" ? "Consent statement" : "Label"} htmlFor={`${idp}-label`} className={field.type === "consent" ? "sm:col-span-2" : undefined}>
          {field.type === "consent" ? (
            <Textarea id={`${idp}-label`} rows={2} value={field.label} onChange={(e) => setLabel(e.target.value)} disabled={disabled} />
          ) : (
            <Input id={`${idp}-label`} value={field.label} onChange={(e) => setLabel(e.target.value)} disabled={disabled} />
          )}
        </Field>
      ) : null}

      {field.type === "text" ? (
        <Field label="Saves to" hint="Name fields fill the contact; anything else becomes a custom field.">
          <Select value={targetOf(field)} onValueChange={setTarget} disabled={disabled}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEXT_TARGETS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      {["text", "textarea", "select", "checkbox"].includes(field.type) && targetOf(field) === "attribute" ? (
        <Field label="Field key" htmlFor={`${idp}-key`} hint="Stored on the contact as attributes.<key>.">
          <Input
            id={`${idp}-key`}
            value={field.key}
            onChange={(e) => onChange({ ...field, key: slugKey(e.target.value), keyEdited: true })}
            className="font-mono"
            disabled={disabled}
          />
        </Field>
      ) : null}

      {["text", "textarea", "email", "phone", "select"].includes(field.type) ? (
        <Field label={field.type === "select" ? "Empty option text" : "Placeholder"} htmlFor={`${idp}-ph`}>
          <Input id={`${idp}-ph`} value={field.placeholder} onChange={(e) => set("placeholder")(e.target.value)} disabled={disabled} placeholder={field.type === "select" ? "Choose…" : ""} />
        </Field>
      ) : null}

      {field.type === "select" ? (
        <Field label="Options" htmlFor={`${idp}-opts`} hint="One per line." className="sm:col-span-2">
          <Textarea
            id={`${idp}-opts`}
            rows={4}
            value={(field.options || []).join("\n")}
            onChange={(e) => set("options")(e.target.value.split("\n").map((o) => o.trimStart()))}
            onBlur={(e) => set("options")(e.target.value.split("\n").map((o) => o.trim()).filter(Boolean))}
            disabled={disabled}
          />
        </Field>
      ) : null}

      {field.type === "consent" ? (
        <Field label="Channel" hint="Checking the box writes an opt-in for this channel to the consent ledger.">
          <Select value={field.channel || "email"} onValueChange={set("channel")} disabled={disabled}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONSENT_CHANNELS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      {field.type === "hidden" ? (
        <>
          <Field label="Captures" hint="Read from the visitor's page URL when they submit.">
            <Select
              value={field.param || "utm_source"}
              onValueChange={(v) => onChange({ ...field, param: v, key: v === "static" ? field.key : uniqueKey(v, fields, field.id), label: v })}
              disabled={disabled}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HIDDEN_PARAMS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {field.param === "static" ? (
            <>
              <Field label="Field key" htmlFor={`${idp}-skey`}>
                <Input id={`${idp}-skey`} value={field.key} onChange={(e) => set("key")(slugKey(e.target.value))} className="font-mono" disabled={disabled} />
              </Field>
              <Field label="Value" htmlFor={`${idp}-sval`}>
                <Input id={`${idp}-sval`} value={field.defaultValue} onChange={(e) => set("defaultValue")(e.target.value)} disabled={disabled} />
              </Field>
            </>
          ) : null}
        </>
      ) : null}

      {field.type !== "hidden" ? (
        <Field label="Help text" htmlFor={`${idp}-help`} className="sm:col-span-2">
          <Input id={`${idp}-help`} value={field.helpText} onChange={(e) => set("helpText")(e.target.value)} disabled={disabled} placeholder="Optional line under the field" />
        </Field>
      ) : null}

      {field.type !== "hidden" ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-card px-3 py-2.5 sm:col-span-2">
          <div>
            <p className="text-sm font-medium text-foreground">Required</p>
            <p className="text-xs text-text-secondary">{field.type === "consent" ? "Visitors must tick it to submit." : "Visitors can't submit without it."}</p>
          </div>
          <Switch checked={Boolean(field.required)} onCheckedChange={set("required")} disabled={disabled} aria-label="Required" />
        </div>
      ) : null}
    </div>
  );
}

export function FormFieldBuilder({ fields, onChange, disabled = false }) {
  const [openId, setOpenId] = useState(fields[0]?.id ?? null);

  const update = (next) => onChange(fields.map((f) => (f.id === next.id ? next : f)));
  const move = (index, dir) => {
    const to = index + dir;
    if (to < 0 || to >= fields.length) return;
    const next = [...fields];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  };
  const add = (type) => {
    const field = newField(type, fields);
    onChange([...fields, field]);
    setOpenId(field.id);
  };
  const duplicate = (field) => {
    const copy = { ...newField(field.type, fields), ...field, id: newField(field.type).id };
    copy.key = uniqueKey(field.key, fields);
    const index = fields.findIndex((f) => f.id === field.id);
    const next = [...fields];
    next.splice(index + 1, 0, copy);
    onChange(next);
    setOpenId(copy.id);
  };
  const remove = (field) => onChange(fields.filter((f) => f.id !== field.id));

  return (
    <div className="space-y-3">
      {fields.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-text-secondary">No fields yet. Add an email field to start.</p>
      ) : null}
      {fields.map((field, index) => {
        const open = openId === field.id;
        return (
          <div key={field.id} className={cn("rounded-xl border bg-surface-subtle", open ? "border-border-strong" : "border-border")}>
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : field.id)}
                aria-expanded={open}
                className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
              >
                <Badge variant="neutral" className="shrink-0">
                  {FIELD_TYPE_LABEL[field.type] || field.type}
                </Badge>
                <span className="min-w-0 truncate text-sm font-medium text-foreground">{field.label || field.key}</span>
                <span className="hidden shrink-0 font-mono text-xs text-text-tertiary sm:inline">{field.type === "consent" ? field.channel : field.key}</span>
                {field.required ? <span className="shrink-0 text-xs text-text-secondary">Required</span> : null}
              </button>
              {!disabled ? (
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${field.label || field.key} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${field.label || field.key} down`} disabled={index === fields.length - 1} onClick={() => move(index, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Duplicate ${field.label || field.key}`} onClick={() => duplicate(field)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${field.label || field.key}`}
                    className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400"
                    onClick={() => remove(field)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>
            {open ? <FieldEditor field={field} fields={fields} onChange={update} disabled={disabled} /> : null}
          </div>
        );
      })}
      {!disabled ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="bg-surface-card">
              <Plus className="h-4 w-4" /> Add field
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72 border-border bg-surface-subtle">
            <DropdownMenuLabel className="text-text-secondary">Field type</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {FIELD_TYPES.map((t) => (
              <DropdownMenuItem key={t.type} onSelect={() => add(t.type)} className="flex cursor-pointer flex-col items-start gap-0.5">
                <span className="text-sm text-foreground">{t.label}</span>
                <span className="text-xs text-text-secondary">{t.description}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export default FormFieldBuilder;
