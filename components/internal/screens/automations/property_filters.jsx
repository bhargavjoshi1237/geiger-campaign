"use client";

import React, { useId } from "react";
import { Plus, X } from "lucide-react";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn } from "@geiger/ui";

import { PROPERTY_OPERATORS, VALUELESS_PROPERTY_OPERATORS, newFilterId } from "@/lib/automations/triggers";

// Event property filter rows ({ id, property, operator, value }), shared by triggers, waits, conditions and goals.
export function PropertyFilters({ value, onChange, hiddenProperties = [], disabled = false, addLabel = "Add property filter" }) {
  const rows = Array.isArray(value) ? value : [];
  const hidden = new Set(hiddenProperties);
  const visible = rows.filter((f) => !hidden.has(f.property) || !f.property);

  const patch = (id, next) => onChange(rows.map((f) => (f.id === id ? { ...f, ...next } : f)));
  const remove = (id) => onChange(rows.filter((f) => f.id !== id));
  const add = () => onChange([...rows, { id: newFilterId(), property: "", operator: "eq", value: "" }]);

  return (
    <div className="space-y-2">
      {visible.map((f) => {
        const valueless = VALUELESS_PROPERTY_OPERATORS.has(f.operator);
        return (
          <div key={f.id} className="flex flex-col gap-2 rounded-lg border border-border bg-surface-card p-2 sm:flex-row sm:items-center">
            <Input
              value={f.property}
              onChange={(e) => patch(f.id, { property: e.target.value })}
              placeholder="property"
              aria-label="Property"
              className="h-8 font-mono text-xs sm:w-36"
              disabled={disabled}
            />
            <Select value={f.operator || "eq"} onValueChange={(operator) => patch(f.id, { operator })} disabled={disabled}>
              <SelectTrigger className="h-8 w-full text-xs sm:w-40" aria-label="Operator">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROPERTY_OPERATORS.map((o) => (
                  <SelectItem key={o.key} value={o.key}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={valueless ? "" : f.value ?? ""}
              onChange={(e) => patch(f.id, { value: e.target.value })}
              placeholder={valueless ? "No value needed" : "value"}
              aria-label="Value"
              className="h-8 flex-1 text-xs"
              disabled={disabled || valueless}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => remove(f.id)}
              aria-label="Remove filter"
              className="shrink-0 self-end text-text-secondary sm:self-auto"
              disabled={disabled}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
      <Button type="button" variant="ghost" size="sm" onClick={add} className="text-muted-foreground" disabled={disabled}>
        <Plus className="h-4 w-4" /> {addLabel}
      </Button>
    </div>
  );
}

// Free-text event name with suggestions from the catalog and events seen in the project.
export function EventNameInput({ value, onChange, suggestions = [], placeholder = "e.g. order_completed", className, id, disabled = false }) {
  const listId = useId();
  const options = [...new Set(suggestions.filter(Boolean))].sort();
  return (
    <>
      <Input
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value.trim().replace(/\s+/g, "_"))}
        placeholder={placeholder}
        list={listId}
        autoComplete="off"
        spellCheck={false}
        className={cn("font-mono text-xs", className)}
        disabled={disabled}
      />
      <datalist id={listId}>
        {options.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  );
}

// Upserts the filter for one fixed property (catalog trigger params) and returns the next filter list.
export function setParamFilter(filters, property, operator, value) {
  const rows = Array.isArray(filters) ? filters : [];
  const existing = rows.find((f) => f.property === property);
  if (value === "" || value == null) return rows.filter((f) => f.property !== property);
  if (existing) return rows.map((f) => (f.property === property ? { ...f, operator, value } : f));
  return [...rows, { id: newFilterId(), property, operator, value }];
}

export function paramFilterValue(filters, property) {
  return (Array.isArray(filters) ? filters : []).find((f) => f.property === property)?.value ?? "";
}
