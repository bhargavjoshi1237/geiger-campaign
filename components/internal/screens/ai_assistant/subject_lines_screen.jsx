"use client";

import React, { useState } from "react";
import { Sparkles, RotateCcw, Copy, Check } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { Field, Pill } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const TONES = ["Friendly", "Professional", "Bold", "Playful", "Urgent"];

// Pre-written subject lines with predicted open-rate scores.
const TEMPLATES = [
  { text: "Don't miss this — it's almost gone", score: 64 },
  { text: "Your exclusive offer is waiting inside", score: 58 },
  { text: "We picked these just for you", score: 52 },
  { text: "Quick question before you go…", score: 47 },
  { text: "The update you've been asking for", score: 41 },
  { text: "New arrivals you'll actually want", score: 36 },
];

function scoreTone(score) {
  if (score >= 55) return "green";
  if (score >= 42) return "amber";
  return "zinc";
}

export function SubjectLinesScreen() {
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState("Friendly");
  const [results, setResults] = useState(null);
  const [copied, setCopied] = useState(null);

  const generate = () => {
    setResults(TEMPLATES.map((t, i) => ({ id: i, ...t })));
    setCopied(null);
  };

  const copy = (id) => {
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
  };

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Subject Lines"
        description="Generate and score subject lines predicted to lift open rates."
      />

      {/* Config */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-subtle p-5 sm:flex-row sm:items-end">
        <Field label="Describe your email" htmlFor="sl-desc" className="flex-1">
          <Input
            id="sl-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Spring sale — 25% off all outerwear this weekend"
            className="bg-background border-border"
          />
        </Field>
        <Field label="Tone" className="sm:w-44">
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Button onClick={generate} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
          <Sparkles className="h-4 w-4" /> {results ? "Regenerate" : "Generate"}
        </Button>
      </div>

      {/* Results */}
      {!results ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface-subtle py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-active text-muted-foreground">
            <Sparkles className="h-6 w-6" />
          </span>
          <p className="mt-4 text-sm text-muted-foreground">Describe your email and generate subject lines.</p>
          <p className="mt-1 text-xs text-text-secondary">Each line comes with a predicted open rate.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {results.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 rounded-xl border border-border bg-surface-subtle p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{r.text}</p>
                <Progress
                  value={r.score}
                  className="mt-2 h-1.5 bg-surface-hover [&_[data-slot=progress-indicator]]:bg-[#ededed]"
                />
              </div>
              <Pill tone={scoreTone(r.score)} className="shrink-0">{r.score}% predicted open</Pill>
              <div className="flex shrink-0 items-center gap-2">
                <Button onClick={() => copy(r.id)} size="sm" variant="ghost" className="h-8 text-muted-foreground hover:bg-surface-active hover:text-foreground">
                  {copied === r.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied === r.id ? "Copied" : "Copy"}
                </Button>
                <Button size="sm" variant="outline" className="h-8 border-border bg-surface-card text-foreground hover:bg-surface-subtle">
                  Use
                </Button>
              </div>
            </div>
          ))}
          <div className="pt-1">
            <Button onClick={generate} size="sm" variant="outline" className="h-8 border-border bg-surface-card text-foreground hover:bg-surface-subtle">
              <RotateCcw className="h-3.5 w-3.5" /> Regenerate
            </Button>
          </div>
        </div>
      )}
    </MainScreenWrapper>
  );
}

export default SubjectLinesScreen;
