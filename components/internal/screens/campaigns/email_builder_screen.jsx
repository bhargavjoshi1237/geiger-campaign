"use client";

import React, { useState } from "react";
import {
  Type, AlignLeft, Image as ImageIcon, MousePointerClick, Minus, MoveVertical,
  Columns2, Share2, Monitor, Smartphone, Eye, Send, Save, Trash2, GripVertical,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
  ScreenHeader,
  SectionCard,
  SegmentedTabs,
  Badge,
  Field,
} from "@geiger/ui";

const BLOCK_LIBRARY = [
  { type: "Heading", icon: Type },
  { type: "Text", icon: AlignLeft },
  { type: "Image", icon: ImageIcon },
  { type: "Button", icon: MousePointerClick },
  { type: "Divider", icon: Minus },
  { type: "Spacer", icon: MoveVertical },
  { type: "Columns", icon: Columns2 },
  { type: "Social", icon: Share2 },
];

// Icon-only device switch; labels stay for screen readers.
const DEVICE_TABS = [
  { value: "desktop", icon: Monitor, label: <span className="sr-only">Desktop</span> },
  { value: "mobile", icon: Smartphone, label: <span className="sr-only">Mobile</span> },
];

let uid = 100;
const defaultContent = (type) => {
  switch (type) {
    case "Heading": return { text: "Your headline here", align: "center" };
    case "Text": return { text: "Add your paragraph copy. Speak to one reader, keep it short, and lead with the value.", align: "left" };
    case "Button": return { text: "Shop now", align: "center" };
    case "Image": return { text: "Image placeholder", align: "center" };
    default: return { text: type, align: "center" };
  }
};

const INITIAL_BLOCKS = [
  { id: 1, type: "Image", content: { text: "Logo", align: "center" } },
  { id: 2, type: "Heading", content: { text: "Summer Sale — up to 40% off", align: "center" } },
  { id: 3, type: "Text", content: { text: "For 48 hours only, our best-selling collection is on sale. Tap below before it's gone.", align: "center" } },
  { id: 4, type: "Button", content: { text: "Shop the sale", align: "center" } },
  { id: 5, type: "Divider", content: { text: "", align: "center" } },
  { id: 6, type: "Social", content: { text: "Follow us", align: "center" } },
];

function CanvasBlock({ block, selected, onSelect }) {
  const align = block.content.align === "center" ? "text-center" : block.content.align === "right" ? "text-right" : "text-left";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative block w-full rounded-lg border px-4 py-3 text-left transition-colors",
        selected ? "border-foreground/80 bg-surface-card" : "border-transparent hover:border-border hover:bg-surface-hover",
      )}
    >
      <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[#3a3a3a]"><GripVertical className="h-4 w-4" /></span>
      <div className={cn("px-3", align)}>
        {block.type === "Heading" && <p className="text-lg font-bold text-[#0b0b0b]">{block.content.text}</p>}
        {block.type === "Text" && <p className="text-sm leading-6 text-[#3a3a3a]">{block.content.text}</p>}
        {block.type === "Button" && (
          <span className="inline-block rounded-md bg-[#0b0b0b] px-4 py-2 text-sm font-medium text-white">{block.content.text}</span>
        )}
        {block.type === "Image" && (
          <span className="flex h-20 items-center justify-center rounded-md bg-[#d4d4d4] text-xs text-text-tertiary">{block.content.text}</span>
        )}
        {block.type === "Divider" && <span className="block h-px w-full bg-[#d4d4d4]" />}
        {block.type === "Spacer" && <span className="block h-6 w-full" />}
        {block.type === "Columns" && (
          <span className="grid grid-cols-2 gap-2">
            <span className="h-14 rounded bg-[#e5e5e5]" /><span className="h-14 rounded bg-[#e5e5e5]" />
          </span>
        )}
        {block.type === "Social" && (
          <span className="flex justify-center gap-2 text-text-tertiary"><Share2 className="h-4 w-4" /><Share2 className="h-4 w-4" /><Share2 className="h-4 w-4" /></span>
        )}
      </div>
    </button>
  );
}

export function EmailBuilderScreen() {
  const [subject, setSubject] = useState("Summer Sale — early access just for you");
  const [device, setDevice] = useState("desktop");
  const [blocks, setBlocks] = useState(INITIAL_BLOCKS);
  const [selectedId, setSelectedId] = useState(2);

  const selected = blocks.find((b) => b.id === selectedId) || null;

  const addBlock = (type) => {
    const id = ++uid;
    setBlocks((p) => [...p, { id, type, content: defaultContent(type) }]);
    setSelectedId(id);
  };
  const updateSelected = (key, value) =>
    setBlocks((p) => p.map((b) => (b.id === selectedId ? { ...b, content: { ...b.content, [key]: value } } : b)));
  const removeSelected = () => {
    setBlocks((p) => p.filter((b) => b.id !== selectedId));
    setSelectedId(null);
  };

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Email Builder"
        description="Compose your email by stacking content blocks — no code required."
        actions={
          <div className="flex items-center gap-2">
            <SegmentedTabs tabs={DEVICE_TABS} value={device} onChange={setDevice} buttonClassName="px-2" />
            <Button variant="outline" className="bg-surface-card"><Eye className="h-4 w-4" /> Preview</Button>
            <Button variant="outline" className="bg-surface-card"><Send className="h-4 w-4" /> Send test</Button>
            <Button><Save className="h-4 w-4" /> Save</Button>
          </div>
        }
      />

      <Field label="Subject line" htmlFor="eb-subject">
        <Input id="eb-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="border-border" />
      </Field>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_1fr_280px]">
        {/* Block library */}
        <SectionCard title="Blocks" contentClassName="p-3">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {BLOCK_LIBRARY.map((b) => (
              <Button
                key={b.type}
                type="button"
                variant="outline"
                onClick={() => addBlock(b.type)}
                className="justify-start bg-surface-card hover:border-border-strong"
              >
                <b.icon className="h-4 w-4 text-muted-foreground" /> {b.type}
              </Button>
            ))}
          </div>
        </SectionCard>

        {/* Canvas */}
        <SectionCard contentClassName="p-6">
          <div className={cn("mx-auto rounded-xl bg-white p-4 shadow-2xl transition-all", device === "mobile" ? "max-w-[360px]" : "max-w-[600px]")}>
            <div className="space-y-1">
              {blocks.map((b) => (
                <CanvasBlock key={b.id} block={b} selected={b.id === selectedId} onSelect={() => setSelectedId(b.id)} />
              ))}
              {blocks.length === 0 && (
                <p className="py-16 text-center text-sm text-text-secondary">Add blocks from the left to start building.</p>
              )}
            </div>
          </div>
        </SectionCard>

        {/* Properties */}
        <SectionCard title="Properties" contentClassName="p-4">
          {selected ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant="neutral">{selected.type}</Badge>
                <Button variant="ghost" size="icon-sm" onClick={removeSelected} aria-label="Remove block" className="text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-300"><Trash2 className="h-4 w-4" /></Button>
              </div>
              {["Heading", "Text", "Button", "Image", "Social"].includes(selected.type) && (
                <Field label="Content">
                  <Textarea value={selected.content.text} onChange={(e) => updateSelected("text", e.target.value)} className="min-h-[70px]" />
                </Field>
              )}
              {["Heading", "Text", "Button"].includes(selected.type) && (
                <Field label="Alignment">
                  <Select value={selected.content.align} onValueChange={(v) => updateSelected("align", v)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="center">Center</SelectItem>
                      <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-secondary">Select a block in the canvas to edit its content.</p>
          )}
        </SectionCard>
      </div>
    </MainScreenWrapper>
  );
}

export default EmailBuilderScreen;
