"use client";

import React from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  Button,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  Switch,
  Textarea,
} from "@geiger/ui";
import { FONT_OPTIONS, SOCIAL_NETWORKS } from "@/lib/email/blocks";
import { VISIBILITY_OPERATORS, describeCondition, operatorNeedsValue } from "@/lib/email/conditions";
import { ALIGN_OPTIONS } from "./block_meta";
import { MergeTextField } from "./merge_tag_picker";
import { ImageField } from "./asset_picker";

// Property editors for every block type, the display-rule editor and document settings.

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "SEK", "BRL", "INR"];

function SelectField({ label, value, onChange, options, disabled, className }) {
  return (
    <Field label={label} className={className}>
      <Select value={String(value ?? "")} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-full bg-surface-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={String(o.value)}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function NumberField({ label, value, onChange, min, max, step = 1, suffix, disabled, hint }) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className="tabular-nums"
          disabled={disabled}
        />
        {suffix ? <span className="text-sm text-text-secondary">{suffix}</span> : null}
      </div>
    </Field>
  );
}

const HEX = /^#[0-9a-f]{6}$/i;

// Empty means "inherit" (brand kit or the renderer default).
export function ColorField({ label, value, onChange, fallback = "#000000", inheritLabel = "Brand", disabled }) {
  const v = value || "";
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} colour`}
          value={HEX.test(v) ? v : fallback}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-border bg-surface-card p-1"
        />
        <Input value={v} onChange={(e) => onChange(e.target.value.trim())} placeholder={inheritLabel} disabled={disabled} className="font-mono text-xs" />
        {v ? (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Reset ${label.toLowerCase()}`} onClick={() => onChange("")} disabled={disabled} className="text-text-secondary hover:text-foreground">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    </Field>
  );
}

function AlignField({ value, onChange, disabled }) {
  return <SelectField label="Alignment" value={value || "left"} onChange={onChange} options={ALIGN_OPTIONS} disabled={disabled} />;
}

function SpacingFields({ props, set, disabled }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <NumberField label="Vertical padding" value={props.padding} onChange={(v) => set({ padding: v })} min={0} max={64} suffix="px" disabled={disabled} />
      <ColorField label="Background" value={props.background} onChange={(v) => set({ background: v })} fallback="#ffffff" inheritLabel="None" disabled={disabled} />
    </div>
  );
}

function SocialLinksEditor({ props, set, disabled }) {
  const links = Array.isArray(props.links) ? props.links : [];
  const update = (i, patch) => set({ links: links.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  return (
    <div className="grid gap-3">
      <SettingsList>
        <SettingRow
          title="Use brand kit links"
          description="When no links are added here, the brand kit's social links are used."
          control={<Switch checked={props.useBrand !== false} onCheckedChange={(v) => set({ useBrand: v })} disabled={disabled} />}
        />
      </SettingsList>
      {links.map((l, i) => (
        <div key={i} className="flex items-end gap-2">
          <SelectField
            label={i === 0 ? "Network" : undefined}
            value={l.network || "website"}
            onChange={(v) => update(i, { network: v })}
            options={SOCIAL_NETWORKS.map((n) => ({ value: n.key, label: n.label }))}
            disabled={disabled}
            className="w-32 shrink-0"
          />
          <Field label={i === 0 ? "URL" : undefined} className="min-w-0 flex-1">
            <Input value={l.url || ""} onChange={(e) => update(i, { url: e.target.value })} placeholder="https://…" disabled={disabled} />
          </Field>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove link" onClick={() => set({ links: links.filter((_, j) => j !== i) })} disabled={disabled} className="mb-0.5 text-text-secondary hover:text-red-600 dark:hover:text-red-400">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="justify-self-start bg-surface-card" onClick={() => set({ links: [...links, { network: "instagram", url: "" }] })} disabled={disabled}>
        <Plus className="h-3.5 w-3.5" /> Add link
      </Button>
    </div>
  );
}

// The property form for one block. `set(patch)` merges into block.props.
export function BlockFields({ block, set, groups, projectId, disabled }) {
  const p = block.props || {};
  const id = (k) => `bf-${block.id}-${k}`;
  switch (block.type) {
    case "heading":
      return (
        <div className="grid gap-3">
          <MergeTextField id={id("text")} label="Text" value={p.text} onChange={(v) => set({ text: v })} groups={groups} disabled={disabled} />
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Size" value={p.level || 1} onChange={(v) => set({ level: Number(v) })} options={[{ value: 1, label: "Large" }, { value: 2, label: "Medium" }, { value: 3, label: "Small" }]} disabled={disabled} />
            <AlignField value={p.align} onChange={(v) => set({ align: v })} disabled={disabled} />
          </div>
          <ColorField label="Text colour" value={p.color} onChange={(v) => set({ color: v })} fallback="#09090b" inheritLabel="Document" disabled={disabled} />
          <SpacingFields props={p} set={set} disabled={disabled} />
        </div>
      );
    case "text":
      return (
        <div className="grid gap-3">
          <MergeTextField
            id={id("text")}
            label="Text"
            value={p.text}
            onChange={(v) => set({ text: v })}
            groups={groups}
            multiline
            rows={7}
            disabled={disabled}
            hint="**bold**, *italic*, [label](https://…); a blank line starts a new paragraph."
          />
          <div className="grid grid-cols-2 gap-3">
            <AlignField value={p.align} onChange={(v) => set({ align: v })} disabled={disabled} />
            <NumberField label="Font size" value={p.fontSize} onChange={(v) => set({ fontSize: v })} min={12} max={22} suffix="px" disabled={disabled} />
          </div>
          <ColorField label="Text colour" value={p.color} onChange={(v) => set({ color: v })} fallback="#3f3f46" inheritLabel="Document" disabled={disabled} />
          <SpacingFields props={p} set={set} disabled={disabled} />
        </div>
      );
    case "image":
      return (
        <div className="grid gap-3">
          <ImageField id={id("src")} label="Image" value={p.src} onChange={(v) => set({ src: v })} onPickAlt={(alt) => !p.alt && set({ alt })} projectId={projectId} disabled={disabled} />
          <Field label="Alt text" htmlFor={id("alt")} hint="Describes the image for screen readers and when images are blocked.">
            <Input id={id("alt")} value={p.alt || ""} onChange={(e) => set({ alt: e.target.value })} placeholder="e.g. Kestrel Aero on a city street" disabled={disabled} />
          </Field>
          <MergeTextField id={id("href")} label="Link" value={p.href} onChange={(v) => set({ href: v })} groups={groups} placeholder="https://… (optional)" disabled={disabled} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Width" value={p.width || ""} onChange={(v) => set({ width: v || 0 })} min={40} max={552} suffix="px" hint="Empty = full width" disabled={disabled} />
            <AlignField value={p.align || "center"} onChange={(v) => set({ align: v })} disabled={disabled} />
          </div>
          <NumberField label="Corner radius" value={p.radius} onChange={(v) => set({ radius: v })} min={0} max={32} suffix="px" disabled={disabled} />
          <ImageField id={id("dark")} label="Dark-mode image" hint="Optional. Shown instead in clients that support dark mode (e.g. a light logo)." value={p.darkSrc} onChange={(v) => set({ darkSrc: v })} projectId={projectId} disabled={disabled} />
          <SpacingFields props={p} set={set} disabled={disabled} />
        </div>
      );
    case "button":
      return (
        <div className="grid gap-3">
          <MergeTextField id={id("label")} label="Label" value={p.label} onChange={(v) => set({ label: v })} groups={groups} disabled={disabled} />
          <MergeTextField id={id("href")} label="Link" value={p.href} onChange={(v) => set({ href: v })} groups={groups} placeholder="https://…" disabled={disabled} />
          <div className="grid grid-cols-2 gap-3">
            <AlignField value={p.align} onChange={(v) => set({ align: v })} disabled={disabled} />
            <NumberField label="Corner radius" value={p.radius} onChange={(v) => set({ radius: v })} min={0} max={32} suffix="px" disabled={disabled} />
          </div>
          <ColorField label="Button colour" value={p.color} onChange={(v) => set({ color: v })} fallback="#18181b" disabled={disabled} />
          <ColorField label="Label colour" value={p.textColor} onChange={(v) => set({ textColor: v })} fallback="#ffffff" inheritLabel="White" disabled={disabled} />
          <SettingsList>
            <SettingRow title="Full width" description="Stretch the button across the email." control={<Switch checked={!!p.fullWidth} onCheckedChange={(v) => set({ fullWidth: v })} disabled={disabled} />} />
          </SettingsList>
          <SpacingFields props={p} set={set} disabled={disabled} />
        </div>
      );
    case "divider":
      return (
        <div className="grid gap-3">
          <ColorField label="Line colour" value={p.color} onChange={(v) => set({ color: v })} fallback="#e4e4e7" inheritLabel="Default" disabled={disabled} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Thickness" value={p.thickness} onChange={(v) => set({ thickness: v })} min={1} max={8} suffix="px" disabled={disabled} />
            <NumberField label="Vertical padding" value={p.padding} onChange={(v) => set({ padding: v })} min={0} max={64} suffix="px" disabled={disabled} />
          </div>
        </div>
      );
    case "spacer":
      return <NumberField label="Height" value={p.height} onChange={(v) => set({ height: v })} min={4} max={120} suffix="px" disabled={disabled} />;
    case "columns":
      return (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Columns" value={p.count === 3 ? 3 : 2} onChange={(v) => set({ count: Number(v) })} options={[{ value: 2, label: "2 columns" }, { value: 3, label: "3 columns" }]} disabled={disabled} />
            <NumberField label="Gap" value={p.gap} onChange={(v) => set({ gap: v })} min={0} max={48} suffix="px" disabled={disabled} />
          </div>
          <p className="text-xs text-text-secondary">Columns stack on phones. Select a block inside a column to edit it.</p>
          <SpacingFields props={p} set={set} disabled={disabled} />
        </div>
      );
    case "product":
      return (
        <div className="grid gap-3">
          <ImageField id={id("img")} label="Image" value={p.imageUrl} onChange={(v) => set({ imageUrl: v })} projectId={projectId} disabled={disabled} />
          <MergeTextField id={id("name")} label="Name" value={p.name} onChange={(v) => set({ name: v })} groups={groups} disabled={disabled} />
          <MergeTextField id={id("desc")} label="Description" value={p.description} onChange={(v) => set({ description: v })} groups={groups} multiline rows={3} disabled={disabled} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="Price" htmlFor={id("price")}>
              <Input id={id("price")} value={p.price ?? ""} onChange={(e) => set({ price: e.target.value })} placeholder="49.00" inputMode="decimal" disabled={disabled} />
            </Field>
            <Field label="Was" htmlFor={id("compare")}>
              <Input id={id("compare")} value={p.compareAtPrice ?? ""} onChange={(e) => set({ compareAtPrice: e.target.value })} placeholder="Optional" inputMode="decimal" disabled={disabled} />
            </Field>
            <SelectField label="Currency" value={p.currency || "USD"} onChange={(v) => set({ currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} disabled={disabled} />
          </div>
          <MergeTextField id={id("href")} label="Link" value={p.href} onChange={(v) => set({ href: v })} groups={groups} placeholder="https://…" disabled={disabled} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Button label" htmlFor={id("btn")}>
              <Input id={id("btn")} value={p.buttonLabel || ""} onChange={(e) => set({ buttonLabel: e.target.value })} placeholder="Empty = no button" disabled={disabled} />
            </Field>
            <SelectField label="Layout" value={p.layout || "stacked"} onChange={(v) => set({ layout: v })} options={[{ value: "stacked", label: "Image on top" }, { value: "side", label: "Image beside" }]} disabled={disabled} />
          </div>
          <SpacingFields props={p} set={set} disabled={disabled} />
        </div>
      );
    case "social":
      return (
        <div className="grid gap-3">
          <SocialLinksEditor props={p} set={set} disabled={disabled} />
          <AlignField value={p.align || "center"} onChange={(v) => set({ align: v })} disabled={disabled} />
          <SpacingFields props={p} set={set} disabled={disabled} />
        </div>
      );
    case "html":
      return (
        <div className="grid gap-3">
          <Field label="HTML" htmlFor={id("html")} hint="Merge tags work here. Scripts, forms, iframes and event handlers are removed.">
            <Textarea id={id("html")} rows={10} value={p.html || ""} onChange={(e) => set({ html: e.target.value })} className="font-mono text-xs" spellCheck={false} disabled={disabled} />
          </Field>
          <SpacingFields props={p} set={set} disabled={disabled} />
        </div>
      );
    default:
      return null;
  }
}

// "Only show to…" rule over merge fields; fields come from mergeTagGroups() (contact + custom fields).
export function VisibilityRuleEditor({ rule, onChange, groups, disabled }) {
  const fields = (groups || []).filter((g) => g.group !== "Links and dates").flatMap((g) => g.fields);
  const labelFor = (key) => fields.find((f) => f.key === key)?.label || key;
  const enabled = !!rule;
  const current = rule || { field: "first_name", operator: "is_set", value: "" };
  const opMeta = VISIBILITY_OPERATORS.find((o) => o.key === current.operator);
  const set = (patch) => {
    const next = { ...current, ...patch };
    const op = VISIBILITY_OPERATORS.find((o) => o.key === next.operator);
    if (op?.field) next.field = op.field;
    onChange(next);
  };
  return (
    <div className="grid gap-3">
      <SettingsList>
        <SettingRow
          title="Only show to some recipients"
          description={enabled ? describeCondition(current, labelFor) : "Everyone sees this block."}
          control={<Switch checked={enabled} onCheckedChange={(v) => onChange(v ? current : null)} disabled={disabled} />}
        />
      </SettingsList>
      {enabled ? (
        <div className="grid gap-3">
          <SelectField
            label="Field"
            value={opMeta?.field || current.field}
            onChange={(v) => set({ field: v })}
            options={fields.map((f) => ({ value: f.key, label: f.label }))}
            disabled={disabled || !!opMeta?.field}
          />
          <SelectField label="Condition" value={current.operator} onChange={(v) => set({ operator: v })} options={VISIBILITY_OPERATORS.map((o) => ({ value: o.key, label: o.label }))} disabled={disabled} />
          {operatorNeedsValue(current.operator) ? (
            <Field label="Value" hint={opMeta?.hint}>
              <Input value={current.value ?? ""} onChange={(e) => set({ value: e.target.value })} placeholder={current.operator?.includes("tag") ? "e.g. vip" : "Value"} disabled={disabled} />
            </Field>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Whole-document settings shown when no block is selected.
export function DocumentSettingsFields({ settings, set, groups, disabled }) {
  const s = settings || {};
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Width" value={s.width} onChange={(v) => set({ width: v })} min={480} max={600} suffix="px" disabled={disabled} />
        <NumberField label="Corner radius" value={s.radius} onChange={(v) => set({ radius: v })} min={0} max={24} suffix="px" disabled={disabled} />
      </div>
      <SelectField label="Font" value={s.fontFamily || "__brand"} onChange={(v) => set({ fontFamily: v === "__brand" ? "" : v })} options={FONT_OPTIONS.map((f) => ({ value: f.key || "__brand", label: f.label }))} disabled={disabled} />
      <ColorField label="Page background" value={s.backgroundColor} onChange={(v) => set({ backgroundColor: v })} fallback="#f4f4f5" disabled={disabled} />
      <ColorField label="Content background" value={s.contentBackground} onChange={(v) => set({ contentBackground: v })} fallback="#ffffff" inheritLabel="White" disabled={disabled} />
      <ColorField label="Text" value={s.textColor} onChange={(v) => set({ textColor: v })} fallback="#3f3f46" disabled={disabled} />
      <ColorField label="Headings" value={s.headingColor} onChange={(v) => set({ headingColor: v })} fallback="#09090b" disabled={disabled} />
      <ColorField label="Links" value={s.linkColor} onChange={(v) => set({ linkColor: v })} fallback="#2563eb" disabled={disabled} />
      <ColorField label="Buttons" value={s.buttonColor} onChange={(v) => set({ buttonColor: v })} fallback="#18181b" disabled={disabled} />
      <SettingsList className="pt-1">
        <SettingRow
          title="Footer with unsubscribe link"
          description="Adds your address and an unsubscribe link. Required for marketing email."
          control={<Switch checked={s.includeFooter !== false} onCheckedChange={(v) => set({ includeFooter: v })} disabled={disabled} />}
        />
        <SettingRow
          title="Dark-mode styles"
          description="Adjusts default backgrounds and text in clients that support dark mode."
          control={<Switch checked={s.darkMode !== false} onCheckedChange={(v) => set({ darkMode: v })} disabled={disabled} />}
        />
      </SettingsList>
      {s.includeFooter !== false ? (
        <MergeTextField id="doc-footer" label="Footer text" value={s.footerText} onChange={(v) => set({ footerText: v })} groups={groups} multiline rows={3} placeholder="Empty = the brand kit's footer text" disabled={disabled} />
      ) : null}
    </div>
  );
}
