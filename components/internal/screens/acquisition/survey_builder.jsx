"use client";

import React, { useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2, X } from "lucide-react";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  cn,
} from "@geiger/ui";
import { QUESTION_LABEL, QUESTION_TYPES, newQuestion } from "@/lib/acquisition/surveys";
import { DESTRUCTIVE_ICON_BUTTON } from "./constants";

// The survey question builder: an ordered list of question cards, one expanded at a time for editing.

const RATING_SCALES = [3, 5, 7, 10];

// Publish blockers for a question list, as plain sentences.
export function surveyIssues(questions = []) {
  const issues = [];
  if (!questions.length) issues.push("Add at least one question.");
  questions.forEach((q, i) => {
    if (!String(q.label || "").trim()) issues.push(`Question ${i + 1} needs a question.`);
    if ((q.type === "single" || q.type === "multiple") && (q.options || []).filter((o) => String(o).trim()).length < 2) {
      issues.push(`Question ${i + 1} needs at least two options.`);
    }
    if ((q.type === "single" || q.type === "multiple") && new Set((q.options || []).map((o) => String(o).trim())).size !== (q.options || []).length) {
      issues.push(`Question ${i + 1} has duplicate options.`);
    }
  });
  return issues;
}

function OptionsEditor({ options, onChange, disabled, idp }) {
  const update = (i, value) => onChange(options.map((o, j) => (j === i ? value : o)));
  return (
    <div className="space-y-2">
      {options.map((option, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input id={i === 0 ? idp : undefined} value={option} onChange={(e) => update(i, e.target.value)} aria-label={`Option ${i + 1}`} disabled={disabled} />
          {!disabled ? (
            <Button variant="ghost" size="icon-sm" aria-label={`Remove option ${i + 1}`} className={DESTRUCTIVE_ICON_BUTTON} onClick={() => onChange(options.filter((_, j) => j !== i))}>
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ))}
      {!disabled && options.length < 12 ? (
        <Button type="button" variant="outline" size="sm" className="bg-surface-card" onClick={() => onChange([...options, `Option ${options.length + 1}`])}>
          <Plus className="h-3.5 w-3.5" /> Add option
        </Button>
      ) : null}
    </div>
  );
}

function QuestionEditor({ question, onChange, disabled }) {
  const set = (key) => (value) => onChange({ ...question, [key]: value });
  const idp = `sb-${question.id}`;
  const choice = question.type === "single" || question.type === "multiple";
  return (
    <div className="grid gap-4 border-t border-border px-4 py-4 sm:grid-cols-2">
      <Field label="Question" htmlFor={`${idp}-label`} className="sm:col-span-2">
        <Textarea id={`${idp}-label`} rows={2} value={question.label} onChange={(e) => set("label")(e.target.value)} disabled={disabled} />
      </Field>
      {choice ? (
        <Field label="Options" htmlFor={`${idp}-opt`} className="sm:col-span-2">
          <OptionsEditor options={question.options || []} onChange={set("options")} disabled={disabled} idp={`${idp}-opt`} />
        </Field>
      ) : null}
      {question.type === "rating" ? (
        <Field label="Scale" hint="Respondents pick from 1 to this number.">
          <Select value={String(question.scale || 5)} onValueChange={(v) => set("scale")(Number(v))} disabled={disabled}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RATING_SCALES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  1 to {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      {question.type === "text" ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-card px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-foreground">Long answer</p>
            <p className="text-xs text-text-secondary">A multi-line box instead of one line.</p>
          </div>
          <Switch checked={Boolean(question.long)} onCheckedChange={set("long")} disabled={disabled} aria-label="Long answer" />
        </div>
      ) : null}
      <div className={cn("flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-card px-3 py-2.5", question.type === "nps" && "sm:col-span-2")}>
        <div>
          <p className="text-sm font-medium text-foreground">Required</p>
          <p className="text-xs text-text-secondary">Respondents can&apos;t submit without answering.</p>
        </div>
        <Switch checked={Boolean(question.required)} onCheckedChange={set("required")} disabled={disabled} aria-label="Required" />
      </div>
    </div>
  );
}

export function SurveyQuestionBuilder({ questions, onChange, disabled = false }) {
  const [openId, setOpenId] = useState(questions[0]?.id ?? null);

  const update = (next) => onChange(questions.map((q) => (q.id === next.id ? next : q)));
  const move = (index, dir) => {
    const to = index + dir;
    if (to < 0 || to >= questions.length) return;
    const next = [...questions];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  };
  const add = (type) => {
    const question = newQuestion(type);
    onChange([...questions, question]);
    setOpenId(question.id);
  };
  const duplicate = (question) => {
    const copy = { ...question, id: newQuestion(question.type).id, options: [...(question.options || [])] };
    const index = questions.findIndex((q) => q.id === question.id);
    const next = [...questions];
    next.splice(index + 1, 0, copy);
    onChange(next);
    setOpenId(copy.id);
  };

  return (
    <div className="space-y-3">
      {questions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-text-secondary">No questions yet. Add one to start.</p>
      ) : null}
      {questions.map((question, index) => {
        const open = openId === question.id;
        const name = question.label || `Question ${index + 1}`;
        return (
          <div key={question.id} className={cn("rounded-xl border bg-surface-subtle", open ? "border-border-strong" : "border-border")}>
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : question.id)}
                aria-expanded={open}
                className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
              >
                <span className="w-5 shrink-0 text-right text-sm tabular-nums text-text-tertiary">{index + 1}</span>
                <Badge variant="neutral" className="shrink-0">
                  {QUESTION_LABEL[question.type] || question.type}
                </Badge>
                <span className="min-w-0 truncate text-sm font-medium text-foreground">{question.label || "Untitled question"}</span>
                {question.required ? <span className="shrink-0 text-xs text-text-secondary">Required</span> : null}
              </button>
              {!disabled ? (
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${name} down`} disabled={index === questions.length - 1} onClick={() => move(index, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Duplicate ${name}`} onClick={() => duplicate(question)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${name}`} className={DESTRUCTIVE_ICON_BUTTON} onClick={() => onChange(questions.filter((q) => q.id !== question.id))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>
            {open ? <QuestionEditor question={question} onChange={update} disabled={disabled} /> : null}
          </div>
        );
      })}
      {!disabled ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="bg-surface-card">
              <Plus className="h-4 w-4" /> Add question
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60 border-border bg-surface-subtle">
            <DropdownMenuLabel className="text-text-secondary">Question type</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {QUESTION_TYPES.map((t) => (
              <DropdownMenuItem key={t.type} onSelect={() => add(t.type)} className="cursor-pointer">
                {t.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export default SurveyQuestionBuilder;
