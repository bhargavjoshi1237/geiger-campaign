"use client";

import React, { useState } from "react";
import { Plus, Upload, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const LOGOS = [
  { id: "primary", label: "Primary", from: "#3b82f6", to: "#1e3a8a" },
  { id: "light", label: "Light", from: "#525252", to: "#171717" },
  { id: "icon", label: "Icon", from: "#8b5cf6", to: "#4c1d95" },
];

const INITIAL_COLORS = [
  { id: 1, name: "Brand Primary", hex: "#3B82F6" },
  { id: 2, name: "Accent", hex: "#EC4899" },
  { id: 3, name: "Ink", hex: "#0B0B0B" },
  { id: 4, name: "Success", hex: "#10B981" },
  { id: 5, name: "Warning", hex: "#F59E0B" },
  { id: 6, name: "Paper", hex: "#F5F5F5" },
];

const PRESETS = ["#3B82F6", "#EC4899", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#0EA5E9", "#0B0B0B"];
const FONTS = ["Inter", "Geist", "Playfair", "Roboto"];

function AddColorDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", hex: "#3B82F6" });
  const valid = form.name.trim() && /^#([0-9a-fA-F]{6})$/.test(form.hex);
  const submit = () => {
    if (!valid) return;
    onCreate({ name: form.name.trim(), hex: form.hex.toUpperCase() });
    setForm({ name: "", hex: "#3B82F6" });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add brand color</DialogTitle>
          <DialogDescription>Give it a name and a hex value, or pick a preset.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" htmlFor="c-name">
              <Input id="c-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Highlight" className="bg-background border-border" />
            </Field>
            <Field label="Hex" htmlFor="c-hex">
              <Input id="c-hex" value={form.hex} onChange={(e) => setForm((f) => ({ ...f, hex: e.target.value }))} placeholder="#3B82F6" className="bg-background border-border font-mono" />
            </Field>
          </div>
          <Field label="Presets">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, hex: p }))}
                  style={{ backgroundColor: p }}
                  className={cn("h-8 w-8 rounded-md border border-border transition-transform hover:scale-110", form.hex.toUpperCase() === p && "ring-2 ring-white ring-offset-2 ring-offset-[#1a1a1a]")}
                  title={p}
                />
              ))}
            </div>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">Cancel</Button>
          <Button onClick={submit} disabled={!valid} className="bg-white text-black hover:bg-[#e5e5e5]">Add color</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BrandKitScreen() {
  const [colors, setColors] = useState(INITIAL_COLORS);
  const [addOpen, setAddOpen] = useState(false);
  const [headingFont, setHeadingFont] = useState("Inter");
  const [bodyFont, setBodyFont] = useState("Inter");

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Brand Kit"
        description="Keep every campaign on-brand with shared logos, colors, and fonts."
      />

      <div className="space-y-8 border-t border-surface-active pt-4">
        {/* Logos */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Logos</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LOGOS.map((logo) => (
              <div key={logo.id} className="overflow-hidden rounded-xl border border-border bg-surface-subtle">
                <div
                  className="flex h-32 items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${logo.from}, ${logo.to})` }}
                >
                  <span className="text-lg font-semibold tracking-tight text-white/90">Geiger</span>
                </div>
                <div className="flex items-center justify-between p-4">
                  <span className="text-sm font-medium text-foreground">{logo.label}</span>
                  <Button variant="outline" size="sm" className="h-8 border-border bg-surface-card text-xs text-foreground hover:bg-surface-active">
                    <Upload className="h-3.5 w-3.5" /> Replace
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Brand colors */}
        <div className="space-y-3 border-t border-surface-active pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Brand colors</h2>
            <Button onClick={() => setAddOpen(true)} variant="outline" size="sm" className="h-8 border-border bg-surface-card text-xs text-foreground hover:bg-surface-active">
              <Plus className="h-3.5 w-3.5" /> Add color
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {colors.map((c) => (
              <button
                key={c.id}
                type="button"
                className="overflow-hidden rounded-xl border border-border bg-surface-subtle text-left transition-colors hover:border-border-strong"
              >
                <span className="block h-20 w-full" style={{ backgroundColor: c.hex }} />
                <span className="block px-3 py-2">
                  <span className="block truncate text-xs font-medium text-foreground">{c.name}</span>
                  <span className="block font-mono text-[11px] text-text-secondary">{c.hex}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Typography */}
        <div className="space-y-3 border-t border-surface-active pt-4">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-text-secondary" />
            <h2 className="text-sm font-semibold text-foreground">Typography</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-border bg-surface-subtle p-5">
              <Field label="Heading font">
                <Select value={headingFont} onValueChange={setHeadingFont}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FONTS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <p className="text-2xl font-bold tracking-tight text-foreground">{headingFont}</p>
            </div>
            <div className="space-y-3 rounded-xl border border-border bg-surface-subtle p-5">
              <Field label="Body font">
                <Select value={bodyFont} onValueChange={setBodyFont}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FONTS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <p className="text-xl text-muted-foreground">{bodyFont}</p>
            </div>
          </div>
        </div>
      </div>

      <AddColorDialog open={addOpen} onOpenChange={setAddOpen} onCreate={(c) => setColors((p) => [...p, { id: Date.now(), ...c }])} />
    </MainScreenWrapper>
  );
}

export default BrandKitScreen;
