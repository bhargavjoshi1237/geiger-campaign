"use client";

import React, { useState } from "react";
import {
  Crop, Scaling, RotateCw, SlidersHorizontal, Type, Sticker, RotateCcw, Download, Image as ImageIcon,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  cn,
  ScreenHeader,
  SectionCard,
  SegmentedTabs,
  Field,
} from "@geiger/ui";

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
    <MainScreenWrapper>
      <ScreenHeader
        title="Image Editor"
        description="Crop, resize, and adjust images without leaving the workspace."
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={reset} variant="outline" className="bg-surface-card"><RotateCcw className="h-4 w-4" /> Reset</Button>
            <Button><Download className="h-4 w-4" /> Export</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_1fr_280px]">
        {/* Tool rail */}
        <SectionCard title="Tools" contentClassName="p-3">
          <SegmentedTabs
            fullWidth
            tabs={TOOLS.map((t) => ({ value: t.id, label: t.label, icon: t.icon }))}
            value={tool}
            onChange={setTool}
            className="lg:flex-col lg:items-stretch"
            buttonClassName="lg:flex-none lg:justify-start"
          />
        </SectionCard>

        {/* Canvas */}
        <SectionCard contentClassName="p-6">
          <div className="flex h-full items-center justify-center">
            <div
              className={cn("flex w-full max-w-[520px] items-center justify-center rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#1e3a8a]", ASPECTS[aspect])}
              style={{ filter }}
            >
              <ImageIcon className="h-12 w-12 text-white/80" />
            </div>
          </div>
        </SectionCard>

        {/* Adjustments */}
        <SectionCard title="Adjustments" contentClassName="space-y-5 p-4">
          <Field label={`Brightness — ${adjust.brightness}%`}>
            <Slider min={0} max={200} value={[adjust.brightness]} onValueChange={([v]) => setVal("brightness", v)} aria-label="Brightness" className="py-1.5" />
          </Field>
          <Field label={`Contrast — ${adjust.contrast}%`}>
            <Slider min={0} max={200} value={[adjust.contrast]} onValueChange={([v]) => setVal("contrast", v)} aria-label="Contrast" className="py-1.5" />
          </Field>
          <Field label={`Saturation — ${adjust.saturation}%`}>
            <Slider min={0} max={200} value={[adjust.saturation]} onValueChange={([v]) => setVal("saturation", v)} aria-label="Saturation" className="py-1.5" />
          </Field>

          <Field label="Filter preset">
            <Select value={preset} onValueChange={applyPreset}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.keys(PRESETS).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </Field>

          <Field label="Aspect ratio">
            <Select value={aspect} onValueChange={setAspect}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.keys(ASPECTS).map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </SectionCard>
      </div>
    </MainScreenWrapper>
  );
}

export default ImageEditorScreen;
