"use client";

import React, { useMemo } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  cn,
} from "@geiger/ui";
import { defaultValueFor, getField, getOperator, isConditionComplete, newCondition } from "@/lib/audience/segment_rules";

const asArray = (v) => (Array.isArray(v) ? v : v ? String(v).split(",").map((s) => s.trim()).filter(Boolean) : []);

function MultiSelect({ options, value, onChange, placeholder, label }) {
  const selected = asArray(value);
  const toggle = (v, on) => onChange(on ? [...selected, v] : selected.filter((x) => x !== v));
  const text = selected.length
    ? selected.map((v) => options.find((o) => String(o.value) === String(v))?.label ?? v).join(", ")
    : placeholder;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={label}
          className="h-10 w-full justify-between border-border bg-surface-card px-3 font-normal text-foreground hover:bg-surface-hover"
        >
          <span className={cn("truncate", !selected.length && "text-text-tertiary")}>{text}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto border-border bg-surface-subtle">
        {options.length ? (
          options.map((o) => (
            <DropdownMenuCheckboxItem
              key={o.value}
              checked={selected.includes(String(o.value))}
              onCheckedChange={(on) => toggle(String(o.value), on)}
              onSelect={(e) => e.preventDefault()}
            >
              {o.label}
            </DropdownMenuCheckboxItem>
          ))
        ) : (
          <p className="px-2 py-1.5 text-xs text-text-tertiary">Nothing to choose from yet.</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OptionSelect({ options, value, onChange, placeholder, label }) {
  if (!options?.length) {
    return <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} />;
  }
  return (
    <Select value={value ? String(value) : undefined} onValueChange={onChange}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue placeholder={placeholder} />
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

function EventValue({ condition, onChange }) {
  const value = condition.value && typeof condition.value === "object" ? condition.value : {};
  const set = (key, v) => onChange({ ...value, [key]: v });
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm text-muted-foreground">
      {condition.field === "event" ? (
        <Input
          value={value.name ?? ""}
          onChange={(e) => set("name", e.target.value)}
          placeholder="event_name"
          aria-label="Event name"
          className="w-40 font-mono text-xs"
          list="segment-event-names"
        />
      ) : null}
      <Input
        type="number"
        min="1"
        value={value.count ?? 1}
        onChange={(e) => set("count", Math.max(1, parseInt(e.target.value, 10) || 1))}
        aria-label="Times"
        className="w-20 tabular-nums"
      />
      <span>{Number(value.count) === 1 || !value.count ? "time" : "times"} in the last</span>
      <Input
        type="number"
        min="1"
        value={value.days ?? ""}
        onChange={(e) => set("days", e.target.value === "" ? null : Math.max(1, parseInt(e.target.value, 10) || 1))}
        placeholder="all"
        aria-label="Days"
        className="w-20 tabular-nums"
      />
      <span>days</span>
    </div>
  );
}

function ValueControl({ condition, field, onChange }) {
  const op = getOperator(condition.operator);
  if (!op || op.value === "none") return <div className="flex-1" />;
  const kind = op.value === "same" ? field.type : op.value;
  const label = `${field.label} value`;

  if (kind === "event") return <EventValue condition={condition} onChange={onChange} />;
  if (kind === "options" || kind === "tags") {
    return (
      <div className="min-w-0 flex-1">
        <MultiSelect options={field.options || []} value={condition.value} onChange={onChange} placeholder="Choose values" label={label} />
      </div>
    );
  }
  if (kind === "select" || kind === "list" || kind === "tag") {
    return (
      <div className="min-w-0 flex-1">
        <OptionSelect
          options={field.options || []}
          value={condition.value}
          onChange={onChange}
          placeholder={kind === "list" ? "Choose a list" : kind === "tag" ? "Tag name" : "Choose a value"}
          label={label}
        />
      </div>
    );
  }
  if (kind === "days") {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
        <Input
          type="number"
          min="1"
          value={condition.value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? "" : Math.max(1, parseInt(e.target.value, 10) || 1))}
          aria-label={label}
          className="w-24 tabular-nums"
        />
        <span>{op.suffix}</span>
      </div>
    );
  }
  return (
    <Input
      type={kind === "number" ? "number" : kind === "date" ? "date" : "text"}
      value={condition.value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={kind === "number" ? "0" : "value"}
      aria-label={label}
      className="min-w-0 flex-1"
    />
  );
}

// One editable condition row: field, operator, value, remove. Stacks when its container is narrow.
export function ConditionRow({ condition, fields, onChange, onRemove, removable = true, invalid = false }) {
  const field = getField(condition.field, fields) || fields[0];
  const groups = useMemo(() => {
    const byGroup = new Map();
    for (const f of fields) {
      if (!byGroup.has(f.group)) byGroup.set(f.group, []);
      byGroup.get(f.group).push(f);
    }
    return [...byGroup].map(([group, items]) => ({ group, items }));
  }, [fields]);

  const changeField = (key) => {
    const next = getField(key, fields);
    const operator = next.operators[0];
    onChange({ ...condition, field: key, operator, value: defaultValueFor(next, operator) });
  };

  const changeOperator = (operator) => {
    const prev = getOperator(condition.operator);
    const next = getOperator(operator);
    const keep = prev && next && (prev.value === next.value || (prev.value === "same" && next.value === field.type));
    onChange({ ...condition, operator, value: keep ? condition.value : defaultValueFor(field, operator) });
  };

  return (
    <div className="@container">
      <div className="grid grid-cols-2 gap-2 @2xl:flex @2xl:items-center">
        <Select value={field.key} onValueChange={changeField}>
          <SelectTrigger className="w-full min-w-0 @2xl:w-48 @2xl:shrink-0" aria-label="Field">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groups.map((g) => (
              <SelectGroup key={g.group}>
                <SelectLabel className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">{g.group}</SelectLabel>
                {g.items.map((f) => (
                  <SelectItem key={f.key} value={f.key}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Select value={condition.operator} onValueChange={changeOperator}>
          <SelectTrigger className="w-full min-w-0 @2xl:w-44 @2xl:shrink-0" aria-label="Operator">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.operators.map((key) => (
              <SelectItem key={key} value={key}>
                {getOperator(key)?.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className={cn("col-span-2 flex min-w-0 items-center gap-2 @2xl:flex-1", invalid && "[&_[aria-label$=value]]:border-amber-500/60 [&_input]:border-amber-500/60")}>
          <ValueControl condition={condition} field={field} onChange={(value) => onChange({ ...condition, value })} />
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onRemove}
              aria-label="Remove condition"
              className="shrink-0 text-text-secondary disabled:opacity-30"
              disabled={!removable}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Match selector plus condition rows over the project's field vocabulary (buildSegmentFields).
export function ConditionBuilder({ match, onMatchChange, conditions, onConditionsChange, fields, eventNames = [], showIncomplete = false, className }) {
  const update = (id, next) => onConditionsChange(conditions.map((c) => (c.id === id ? next : c)));
  return (
    <div className={cn("space-y-3 rounded-xl border border-border bg-surface-card p-4", className)}>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        Contacts that match
        <Select value={match} onValueChange={onMatchChange}>
          <SelectTrigger size="sm" className="w-20" aria-label="Match">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">all</SelectItem>
            <SelectItem value="any">any</SelectItem>
          </SelectContent>
        </Select>
        of these conditions
      </div>

      <div className="space-y-2">
        {conditions.map((c, i) => (
          <React.Fragment key={c.id}>
            {i > 0 ? (
              <div className="flex items-center gap-2" aria-hidden>
                <span className="rounded-md border border-border bg-surface-active px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                  {match === "any" ? "or" : "and"}
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
            ) : null}
            <ConditionRow
              condition={c}
              fields={fields}
              onChange={(next) => update(c.id, next)}
              onRemove={() => onConditionsChange(conditions.filter((x) => x.id !== c.id))}
              removable={conditions.length > 1}
              invalid={showIncomplete && !isConditionComplete(c)}
            />
          </React.Fragment>
        ))}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onConditionsChange([...conditions, newCondition(fields[0]?.key, fields)])}
        className="text-muted-foreground"
      >
        <Plus className="h-4 w-4" /> Add condition
      </Button>

      <datalist id="segment-event-names">
        {eventNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </div>
  );
}
