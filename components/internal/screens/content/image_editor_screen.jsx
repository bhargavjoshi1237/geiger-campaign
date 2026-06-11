"use client";

import React, { useState } from "react";
import {
  Crop, Scaling, RotateCw, SlidersHorizontal, Type, Sticker, RotateCcw, Download, Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const TOOLS = [
  { id: "crop", label: "Crop", icon: Crop },
  { id: "resize", label: "Resize", icon: Scaling },
  { id: "rotate", label: "Rotate", icon: RotateCw },
  { id: "filters", label: "Filters", icon: SlidersHorizontal },
  { id: "text", label: "Text", icon: Type },
  { id: "stickers", label: "Stickers", icon: Sticker },
];

const PRESETS = {
  None: { brightness: 100, contrast: 100, saturation: 100 },
  Mono: { brightness: 105, contrast: 110, saturation: 0 },
  Warm: { brightness: 108, contrast: 102, saturation: 130 },
  Cool: { brightness: 96, contrast: 104, saturation: 115 },
  Vivid: { brightness: 104, contrast: 120, saturation: 160 },
};

const DEFAULTS = { brightness: 100, contrast: 100, saturation: 100 };

const ASPECTS = {
  Original: "aspect-video",
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "16:9": "aspect-video",
};

export function ImageEditorScreen() {
  const [tool, setTool] = useState("filters");
  const [adjust, setAdjust] = useState(DEFAULTS);
  const [preset, setPreset] = useState("None");
  const [aspect, setAspect] = useState("Original");

  const setVal = (key, value) => {
    setAdjust((a) => ({ ...a, [key]: Number(value) }));
    setPreset("None");
  };
  const applyPreset = (name) => {
    setPreset(name);
    setAdjust(PRESETS[name]);
  };
  const reset = () => {
    setAdjust(DEFAULTS);
    setPreset("None");
    setAspect("Original");
  };

  const filter = `brightness(${adjust.brightness}%) contrast(${adjust.contrast}%) saturate(${adjust.saturation}%)`;

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Image Editor"
        description="Crop, resize, and adjust images without leaving the workspace."
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={reset} variant="outline" className="h-9 border-border bg-surface-card text-foreground hover:bg-surface-subtle"><RotateCcw className="h-4 w-4" /> Reset</Button>
            <Button className="h-9 bg-white text-black hover:bg-[#e5e5e5]"><Download className="h-4 w-4" /> Export</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 border-t border-surface-active pt-4 lg:grid-cols-[200px_1fr_280px]">
        {/* Tool rail */}
        <div className="rounded-xl border border-border bg-surface-subtle p-3">
          <p className="px-1 pb-2 text-[11px] font-medium uppercase tracking-wider text-text-secondary">Tools</p>
          <div className="flex flex-row gap-2 lg:flex-col">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTool(t.id)}
                className={cn(
                  "flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                  tool === t.id
                    ? "border-white/80 bg-surface-card text-white"
                    : "border-border bg-surface-card text-foreground hover:border-border-strong hover:bg-surface-active",
                )}
              >
                <t.icon className="h-4 w-4 text-muted-foreground" /> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="rounded-xl border border-border bg-surface-card p-6">
          <div className="flex h-full items-center justify-center">
            <div
              className={cn("flex w-full max-w-[520px] items-center justify-center rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#1e3a8a]", ASPECTS[aspect])}
              style={{ filter }}
            >
              <ImageIcon className="h-12 w-12 text-white/80" />
            </div>
          </div>
        </div>

        {/* Adjustments */}
        <div className="space-y-5 rounded-xl border border-border bg-surface-subtle p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Adjustments</p>

          <Field label={`Brightness — ${adjust.brightness}%`}>
            <input type="range" min={0} max={200} value={adjust.brightness} onChange={(e) => setVal("brightness", e.target.value)} className="w-full accent-white" />
          </Field>
          <Field label={`Contrast — ${adjust.contrast}%`}>
            <input type="range" min={0} max={200} value={adjust.contrast} onChange={(e) => setVal("contrast", e.target.value)} className="w-full accent-white" />
          </Field>
          <Field label={`Saturation — ${adjust.saturation}%`}>
            <input type="range" min={0} max={200} value={adjust.saturation} onChange={(e) => setVal("saturation", e.target.value)} className="w-full accent-white" />
          </Field>

          <Field label="Filter preset">
            <Select value={preset} onValueChange={applyPreset}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.keys(PRESETS).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </Field>

          <Field label="Aspect ratio">
            <Select value={aspect} onValueChange={setAspect}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.keys(ASPECTS).map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
      </div>
    </MainScreenWrapper>
  );
}

export default ImageEditorScreen;
