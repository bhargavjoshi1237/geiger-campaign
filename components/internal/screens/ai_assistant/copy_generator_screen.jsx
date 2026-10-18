"use client";

import React, { useState } from "react";
import { Sparkles, RotateCcw, Copy } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  ScreenHeader,
  SectionCard,
  EmptyState,
  Badge,
  Field,
} from "@geiger/ui";

const CONTENT_TYPES = ["Email body", "Ad", "Social post", "Product description"];
const TONES = ["Friendly", "Professional", "Bold", "Playful"];
const LENGTHS = ["Short", "Medium", "Long"];

// Pre-written, realistic copy variants keyed loosely off the content type.
function buildVariants({ prompt, contentType, tone, length }) {
  const subject = prompt?.trim() || "your latest offer";
  const long = length === "Long";
  const base = {
    "Email body": [
      `Hi there,\n\nWe built something we think you'll love${long ? ", and we couldn't wait to share it" : ""}. ${capitalize(subject)} is here, designed to fit right into your day.\n\nTake a look and see what's new — your future self will thank you.\n\nWarmly,\nThe team`,
      `Quick one for you: ${subject} just dropped.\n\nNo fluff${long ? ", no catch — just a smarter way to get more done. Thousands of people made the switch this month alone" : ""}. Want in?\n\nTap below and you're set in under two minutes.`,
      `You asked, we listened. ${capitalize(subject)} is officially live.\n\n${long ? "We rebuilt it from the ground up based on your feedback, and the result speaks for itself. " : ""}Ready when you are — explore it today and let us know what you think.`,
    ],
    Ad: [
      `${capitalize(subject)} — finally, the easy way. Try it free today.`,
      `Stop settling for ordinary. ${capitalize(subject)} is the upgrade you've been waiting for.${long ? " Join thousands who already made the leap." : ""}`,
      `Less hassle. More results. Discover ${subject} now.`,
    ],
    "Social post": [
      `✨ Big news: ${subject} is here. ${long ? "We poured months into this and we're so proud of how it turned out. " : ""}Drop a 🙌 if you're as excited as we are. #JustLaunched`,
      `POV: you just found ${subject} and your week instantly got easier. 😌 Link in bio.`,
      `We don't usually brag, but ${subject} kind of speaks for itself. ${long ? "Swipe to see why everyone's talking about it. " : ""}Who's trying it first? 👇`,
    ],
    "Product description": [
      `${capitalize(subject)} blends thoughtful design with everyday practicality.${long ? " Every detail was considered, from the materials to the finish, so it performs as good as it looks." : ""} Built to last, made to love.`,
      `Meet ${subject} — the simple, dependable choice. ${long ? "Crafted with premium materials and a no-compromise approach to quality. " : ""}Exactly what you need, nothing you don't.`,
      `Smart, sleek, and seriously capable. ${capitalize(subject)} earns its place in your routine${long ? " from the very first use, and keeps proving its worth long after" : ""}.`,
    ],
  };
  const toneTag = tone;
  return base[contentType].map((copy, i) => ({
    id: i,
    label: ["Variant A", "Variant B", "Variant C"][i],
    copy,
    meta: `${toneTag} · ${length}`,
  }));
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function CopyGeneratorScreen() {
  const [prompt, setPrompt] = useState("");
  const [contentType, setContentType] = useState("Email body");
  const [tone, setTone] = useState("Friendly");
  const [length, setLength] = useState("Medium");
  const [variants, setVariants] = useState(null);

  const generate = () =>
    setVariants(buildVariants({ prompt, contentType, tone, length }));

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Copy Generator"
        description="Generate on-brand marketing copy in seconds."
      />

      {/* Config form */}
      <SectionCard contentClassName="space-y-4">
        <Field label="Prompt" htmlFor="cg-prompt">
          <Textarea
            id="cg-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What are you promoting?"
            className="min-h-20 bg-background"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Content type">
            <Select value={contentType} onValueChange={setContentType}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONTENT_TYPES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tone">
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Length">
            <Select value={length} onValueChange={setLength}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LENGTHS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Button onClick={generate}>
          <Sparkles className="h-4 w-4" /> {variants ? "Regenerate" : "Generate"}
        </Button>
      </SectionCard>

      {/* Results */}
      {!variants ? (
        <EmptyState
          icon={Sparkles}
          title="Describe what you're promoting and generate copy."
          description="You'll get three on-brand variants to choose from."
          className="rounded-xl border border-dashed border-border bg-surface-subtle"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {variants.map((v) => (
            <div key={v.id} className="flex flex-col rounded-xl border border-border bg-surface-subtle p-5">
              <div className="flex items-center justify-between">
                <Badge variant="neutral" className="text-foreground">{v.label}</Badge>
                <span className="text-xs text-text-secondary">{v.meta}</span>
              </div>
              <p className="mt-4 flex-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{v.copy}</p>
              <div className="mt-5 flex items-center gap-2 border-t border-surface-active pt-4">
                <Button size="sm" variant="outline" className="bg-surface-card hover:bg-surface-subtle">
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
                <Button onClick={generate} size="sm" variant="ghost" className="text-muted-foreground">
                  <RotateCcw className="h-3.5 w-3.5" /> Regenerate
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </MainScreenWrapper>
  );
}

export default CopyGeneratorScreen;
