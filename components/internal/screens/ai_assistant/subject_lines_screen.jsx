"use client";

import React, { useState } from "react";
import { Sparkles, RotateCcw, Copy, Check } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  Input,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScreenHeader,
  SectionCard,
  EmptyState,
  Field,
  Badge,
} from "@geiger/ui";

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
  if (score >= 55) return "success";
  if (score >= 42) return "warning";
  return "neutral";
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
    <MainScreenWrapper>
      <ScreenHeader
        title="Subject Lines"
        description="Generate and score subject lines predicted to lift open rates."
      />

      {/* Config */}
      <SectionCard contentClassName="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Describe your email" htmlFor="sl-desc" className="flex-1">
          <Input
            id="sl-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Spring sale — 25% off all outerwear this weekend"
          />
        </Field>
        <Field label="Tone" className="sm:w-44">
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Button onClick={generate}>
          <Sparkles className="h-4 w-4" /> {results ? "Regenerate" : "Generate"}
        </Button>
      </SectionCard>

      {/* Results */}
      {!results ? (
        <EmptyState
          icon={Sparkles}
          title="Describe your email and generate subject lines."
          description="Each line comes with a predicted open rate."
          className="rounded-xl border border-dashed border-border bg-surface-subtle"
        />
      ) : (
        <div className="space-y-3">
          {results.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 rounded-xl border border-border bg-surface-subtle p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{r.text}</p>
                <Progress
                  value={r.score}
                  className="mt-2 h-1.5 bg-surface-hover"
                />
              </div>
              <Badge variant={scoreTone(r.score)} className="shrink-0">{r.score}% predicted open</Badge>
              <div className="flex shrink-0 items-center gap-2">
                <Button onClick={() => copy(r.id)} size="sm" variant="ghost" className="text-muted-foreground">
                  {copied === r.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied === r.id ? "Copied" : "Copy"}
                </Button>
                <Button size="sm" variant="outline" className="bg-surface-card hover:bg-surface-subtle">
                  Use
                </Button>
              </div>
            </div>
          ))}
          <div className="pt-1">
            <Button onClick={generate} size="sm" variant="outline" className="bg-surface-card hover:bg-surface-subtle">
              <RotateCcw className="h-3.5 w-3.5" /> Regenerate
            </Button>
          </div>
        </div>
      )}
    </MainScreenWrapper>
  );
}

export default SubjectLinesScreen;
