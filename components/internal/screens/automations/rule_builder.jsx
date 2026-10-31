"use client";

import React, { useMemo } from "react";
import { Plus, X } from "lucide-react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui";

import { SEGMENT_FIELDS, SEGMENT_OPERATORS } from "@/lib/audience/segment_rules";

// Contact rule builder in the segment_rules vocabulary ({ match, conditions: [{ id, field, operator, value }] }),
// used by reusable condition sets and condition steps. Lists and custom fields extend the field list.

const OP_BY_KEY = new Map(SEGMENT_OPERATORS.map((o) => [o.key, o]));

// What the value control edits for an operator (segment_rules' `value` hint, inferred when absent).
function valueKind(field, operatorKey) {
  const op = OP_BY_KEY.get(operatorKey);
  const hint = op?.value;
  if (hint && hint !== "same") return hint;
  if (hint === "same") return field?.type === "select" ? "option" : field?.type || "text";
  if (/(^is_(not_)?set$)|^is_(true|false)$/.test(operatorKey || "")) return "none";
  if (field?.type === "list") return "list";
  if (field?.type === "tags") return "tag";
  if (field?.type === "event") return "event";
  if (field?.type === "date" && /days/.test(operatorKey || "")) return "days";
  return field?.type || "text";
}

function defaultValue(field, operatorKey) {
  const kind = valueKind(field, operatorKey);
  if (kind === "none") return null;
  if (kind === "options" || kind === "tags") return [];
  if (kind === "days") return 30;
  if (kind === "event") return { name: "", count: 1, days: 30 };
  if (kind === "option" || kind === "list") return field?.options?.[0]?.value ?? "";
  return "";
}

const operatorsOf = (field) => {
  const keys = Array.isArray(field?.operators) ? field.operators : SEGMENT_OPERATORS.filter((o) => o.types?.includes(field?.type)).map((o) => o.key);
  return keys.map((k) => OP_BY_KEY.get(k)).filter(Boolean);
};

export function useRuleFields({ lists = [], customFields = [], tags = [] } = {}) {
  return useMemo(() => {
    const listOptions = lists.map((l) => ({ value: String(l.id), label: l.name || "Untitled list" }));
    const tagOptions = tags.map((t) => (typeof t === "object" ? { value: t.name, label: t.name } : { value: t, label: t }));
    const builtIns = SEGMENT_FIELDS.map((f) => (f.type === "list" ? { ...f, options: listOptions } : f.type === "tags" ? { ...f, options: tagOptions } : f));
    const custom = customFields
      .filter((f) => f?.key)
      .map((f) => {
        const type = ["text", "number", "date", "boolean", "select"].includes(f.type) ? f.type : "text";
        return {
          key: `attributes.${f.key}`,
          label: f.label || f.key,
          type,
          group: "Custom fields",
          operators: SEGMENT_OPERATORS.filter((o) => o.types?.includes(type)).map((o) => o.key),
          options: type === "select" ? (f.options || []).map((o) => (typeof o === "object" ? o : { value: String(o), label: String(o) })) : undefined,
        };
      });
    return [...builtIns, ...custom];
  }, [lists, customFields, tags]);
}

export function newRule(fields) {
  const field = fields[0];
  const operator = operatorsOf(field)[0]?.key || "";
  return { id: globalThis.crypto.randomUUID(), field: field?.key || "", operator, value: defaultValue(field, operator) };
}

// "Lead score is at least 75" — one readable line per rule.
export function ruleText(rule, fields = SEGMENT_FIELDS) {
  const field = fields.find((f) => f.key === rule?.field);
  const op = OP_BY_KEY.get(rule?.operator);
  if (!field || !op) return "Incomplete rule";
  const kind = valueKind(field, op.key);
  const label = (v) => field.options?.find((o) => String(o.value) === String(v))?.label ?? v;
  let value = "";
  if (kind === "event") {
    const v = rule.value || {};
    const name = rule.field === "event" ? `“${v.name || "…"}”` : "";
    value = `${name} ${Number(v.count) || 1}× ${v.days ? `in ${v.days} days` : "ever"}`.trim();
  } else if (kind !== "none") {
    value = Array.isArray(rule.value) ? rule.value.map(label).join(", ") : String(label(rule.value) ?? "");
    if (op.suffix) value = `${value} ${op.suffix}`;
  }
  return `${field.label} ${op.label} ${value}`.trim();
}

function ValueControl({ field, rule, onChange, disabled }) {
  const kind = valueKind(field, rule.operator);
  const v = rule.value;
  const cls = "h-8 text-xs";
  if (kind === "none") return <span className="flex h-8 items-center px-1 text-xs text-text-tertiary">No value needed</span>;
  if (kind === "option" || kind === "list") {
    const options = field?.options || [];
    if (!options.length) {
      return <span className="flex h-8 items-center px-1 text-xs text-text-tertiary">{kind === "list" ? "No lists yet" : "No options"}</span>;
    }
    return (
      <Select value={v ? String(v) : ""} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className={`${cls} w-full`} aria-label="Value">
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={String(o.value)}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (kind === "options" || kind === "tags") {
    return (
      <Input
        value={Array.isArray(v) ? v.join(", ") : v ?? ""}
        onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
        placeholder="Comma separated"
        aria-label="Values"
        className={cls}
        disabled={disabled}
      />
    );
  }
  if (kind === "event") {
    const ev = v && typeof v === "object" ? v : { name: "", count: 1, days: 30 };
    return (
      <div className="flex flex-1 items-center gap-1.5">
        {rule.field === "event" ? (
          <Input
            value={ev.name || ""}
            onChange={(e) => onChange({ ...ev, name: e.target.value.trim() })}
            placeholder="event name"
            aria-label="Event name"
            className={`${cls} font-mono`}
            disabled={disabled}
          />
        ) : null}
        <Input type="number" min={1} value={ev.count ?? 1} onChange={(e) => onChange({ ...ev, count: Number(e.target.value) || 1 })} aria-label="Times" className={`${cls} w-16`} disabled={disabled} />
        <span className="text-xs text-text-tertiary">× in</span>
        <Input type="number" min={1} value={ev.days ?? ""} onChange={(e) => onChange({ ...ev, days: e.target.value === "" ? null : Number(e.target.value) })} aria-label="Days" className={`${cls} w-16`} disabled={disabled} />
        <span className="text-xs text-text-tertiary">days</span>
      </div>
    );
  }
  const type = kind === "number" || kind === "days" ? "number" : kind === "date" ? "date" : "text";
  return (
    <div className="flex flex-1 items-center gap-1.5">
      <Input
        type={type}
        value={v ?? ""}
        onChange={(e) => onChange(type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
        placeholder="value"
        aria-label="Value"
        className={cls}
        disabled={disabled}
      />
      {OP_BY_KEY.get(rule.operator)?.suffix ? <span className="shrink-0 text-xs text-text-tertiary">{OP_BY_KEY.get(rule.operator).suffix}</span> : null}
    </div>
  );
}

export function RuleBuilder({ value, onChange, fields, disabled = false }) {
  const match = value?.match === "any" ? "any" : "all";
  const rules = Array.isArray(value?.conditions) ? value.conditions : [];
  const emit = (patch) => onChange({ match, conditions: rules, ...patch });
  const patchRule = (id, next) => emit({ conditions: rules.map((r) => (r.id === id ? { ...r, ...next } : r)) });

  const groups = useMemo(() => {
    const out = new Map();
    for (const f of fields) {
      const key = f.group || "Fields";
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(f);
    }
    return [...out.entries()];
  }, [fields]);

  if (!fields.length) {
    return <p className="rounded-lg border border-border bg-surface-card px-3 py-2.5 text-xs text-text-secondary">Contact fields aren&apos;t available yet.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <span>Match</span>
        <Select value={match} onValueChange={(m) => emit({ match: m })} disabled={disabled}>
          <SelectTrigger className="h-7 w-20 text-xs" aria-label="Match">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">all</SelectItem>
            <SelectItem value="any">any</SelectItem>
          </SelectContent>
        </Select>
        <span>of these rules</span>
      </div>

      {rules.map((rule) => {
        const field = fields.find((f) => f.key === rule.field);
        const ops = operatorsOf(field);
        return (
          <div key={rule.id} className="flex flex-col gap-2 rounded-lg border border-border bg-surface-card p-2 sm:flex-row sm:items-center">
            <Select
              value={rule.field || ""}
              onValueChange={(key) => {
                const next = fields.find((f) => f.key === key);
                const operator = operatorsOf(next)[0]?.key || "";
                patchRule(rule.id, { field: key, operator, value: defaultValue(next, operator) });
              }}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 w-full text-xs sm:w-44" aria-label="Field">
                <SelectValue placeholder="Field" />
              </SelectTrigger>
              <SelectContent>
                {groups.map(([group, items]) => (
                  <SelectGroup key={group}>
                    <SelectLabel className="text-[10px] uppercase tracking-wider text-text-tertiary">{group}</SelectLabel>
                    {items.map((f) => (
                      <SelectItem key={f.key} value={f.key}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={rule.operator || ""}
              onValueChange={(operator) => patchRule(rule.id, { operator, value: defaultValue(field, operator) })}
              disabled={disabled || !field}
            >
              <SelectTrigger className="h-8 w-full text-xs sm:w-40" aria-label="Operator">
                <SelectValue placeholder="Operator" />
              </SelectTrigger>
              <SelectContent>
                {ops.map((o) => (
                  <SelectItem key={o.key} value={o.key}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex min-w-0 flex-1">
              {field ? <ValueControl field={field} rule={rule} onChange={(val) => patchRule(rule.id, { value: val })} disabled={disabled} /> : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => emit({ conditions: rules.filter((r) => r.id !== rule.id) })}
              aria-label="Remove rule"
              className="shrink-0 self-end text-text-secondary sm:self-auto"
              disabled={disabled}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        );
      })}

      <Button type="button" variant="ghost" size="sm" onClick={() => emit({ conditions: [...rules, newRule(fields)] })} className="text-muted-foreground" disabled={disabled}>
        <Plus className="h-4 w-4" /> Add rule
      </Button>
    </div>
  );
}
