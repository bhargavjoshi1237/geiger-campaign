"use client";

import React, { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button, Input, Textarea, cn } from "@geiger/ui";

// Renders a survey for respondents (hosted /s/<id>) and for the builder's preview (no submit).
// Scales are real radio groups, so they work with a keyboard and a screen reader.

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

function Scale({ question, value, onChange, disabled }) {
  const min = question.type === "nps" ? 0 : 1;
  const max = question.type === "nps" ? 10 : question.scale || 5;
  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label={question.label} className="flex flex-wrap gap-1.5">
        {options.map((n) => {
          const selected = value === n;
          return (
            <label
              key={n}
              className={cn(
                "flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-md border px-2 text-sm font-medium tabular-nums transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-surface-hover",
                disabled && "pointer-events-none opacity-60",
              )}
            >
              <input type="radio" name={question.id} value={n} checked={selected} onChange={() => onChange(n)} className="sr-only" disabled={disabled} />
              {n}
            </label>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-text-secondary">
        <span>{question.type === "nps" ? "Not at all likely" : "Poor"}</span>
        <span>{question.type === "nps" ? "Extremely likely" : "Excellent"}</span>
      </div>
    </div>
  );
}

function Choices({ question, value, onChange, disabled }) {
  const multiple = question.type === "multiple";
  const selected = multiple ? (Array.isArray(value) ? value : []) : value;
  return (
    <div className="space-y-2">
      {question.options.map((option) => {
        const checked = multiple ? selected.includes(option) : selected === option;
        return (
          <label key={option} className="flex items-center gap-2.5 text-sm text-foreground">
            <input
              type={multiple ? "checkbox" : "radio"}
              name={question.id}
              value={option}
              checked={checked}
              disabled={disabled}
              onChange={() =>
                multiple ? onChange(checked ? selected.filter((v) => v !== option) : [...selected, option]) : onChange(option)
              }
              className="h-4 w-4 accent-primary"
            />
            {option}
          </label>
        );
      })}
    </div>
  );
}

export function SurveyForm({ survey, preview = false, contactToken = "" }) {
  const [answers, setAnswers] = useState({});
  const [errors, setErrors] = useState({});
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("");

  if (!survey) return null;
  const submitting = state === "submitting";
  const set = (id) => (value) => {
    setAnswers((a) => ({ ...a, [id]: value }));
    if (errors[id]) setErrors((e) => ({ ...e, [id]: undefined }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (preview || submitting) return;
    setState("submitting");
    setMessage("");
    try {
      const res = await fetch(`${BASE_PATH}/api/public/surveys/${survey.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          gc: contactToken || undefined,
          _gc_url: window.location.href,
          _gc_hp: event.currentTarget.elements.namedItem("_gc_hp")?.value || "",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(body.fieldErrors || {});
        setState("idle");
        setMessage(body.error || "Something went wrong. Try again.");
        return;
      }
      setState("done");
      setMessage(body.message || survey.thankYouMessage);
    } catch {
      setState("idle");
      setMessage("Network error — check your connection and try again.");
    }
  };

  if (state === "done") {
    return (
      <div role="status" className="flex items-start gap-3 rounded-lg border border-border bg-surface-card p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <p className="text-sm leading-6 text-foreground">{message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="relative space-y-8" aria-label={survey.name}>
      {survey.questions.map((q, i) => (
        <fieldset key={q.id} className="space-y-3" aria-describedby={errors[q.id] ? `sq-${q.id}-error` : undefined}>
          <legend className="text-base font-medium leading-6 text-foreground">
            <span className="mr-1.5 tabular-nums text-text-tertiary">{i + 1}.</span>
            {q.label}
            {q.required ? null : <span className="font-normal text-text-tertiary"> (optional)</span>}
          </legend>
          {q.type === "nps" || q.type === "rating" ? (
            <Scale question={q} value={answers[q.id]} onChange={set(q.id)} disabled={submitting} />
          ) : q.type === "single" || q.type === "multiple" ? (
            <Choices question={q} value={answers[q.id]} onChange={set(q.id)} disabled={submitting} />
          ) : q.long ? (
            <Textarea rows={4} value={answers[q.id] || ""} onChange={(e) => set(q.id)(e.target.value)} disabled={submitting} aria-label={q.label} />
          ) : (
            <Input value={answers[q.id] || ""} onChange={(e) => set(q.id)(e.target.value)} disabled={submitting} aria-label={q.label} />
          )}
          {errors[q.id] ? (
            <p id={`sq-${q.id}-error`} className="text-xs text-red-600 dark:text-red-400">
              {errors[q.id]}
            </p>
          ) : null}
        </fieldset>
      ))}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Leave this field empty
          <input type="text" name="_gc_hp" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      {message ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {message}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting} aria-disabled={preview || undefined}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {survey.submitLabel || "Submit"}
      </Button>
    </form>
  );
}

export default SurveyForm;
