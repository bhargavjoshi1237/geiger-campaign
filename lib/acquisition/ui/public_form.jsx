"use client";

import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button, Input, Textarea, cn } from "@geiger/ui";

// Renders one form for visitors: hosted /f/<id>, landing page form blocks, and the builder's live preview
// (preview = no submit, no view beacon). Without JavaScript the <form> still posts to the submit route,
// which answers with a redirect; with it, the post is JSON and errors land on the right fields.

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

const SELECT_CLASS =
  "w-full min-w-0 rounded-[var(--input-box-radius,0.375rem)] border border-input bg-background px-3 py-2 text-base leading-5 text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm";

function pageValue(param) {
  if (typeof window === "undefined") return "";
  if (param === "referrer") return document.referrer || "";
  if (param === "page_url") return window.location.href;
  if (param?.startsWith("utm_")) return new URLSearchParams(window.location.search).get(param) || "";
  return "";
}

function pageUtm() {
  const params = new URLSearchParams(window.location.search);
  const utm = {};
  for (const key of ["source", "medium", "campaign", "term", "content"]) {
    const v = params.get(`utm_${key}`);
    if (v) utm[key] = v;
  }
  return utm;
}

function initialValues(fields) {
  const values = {};
  for (const f of fields) values[f.key] = f.type === "checkbox" || f.type === "consent" ? false : f.type === "hidden" && f.param === "static" ? f.defaultValue : "";
  return values;
}

function FieldControl({ field, value, error, disabled, onChange }) {
  const id = `gcf-${field.id}`;
  const describedBy = [field.helpText ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  const common = { id, name: field.key, disabled, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy };

  if (field.type === "checkbox" || field.type === "consent") {
    return (
      <div className="space-y-1">
        <label htmlFor={id} className="flex items-start gap-2.5 text-sm leading-5 text-foreground">
          <input
            {...common}
            type="checkbox"
            value="true"
            checked={Boolean(value)}
            required={field.required}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
          />
          <span>
            {field.label}
            {field.required ? <span className="text-text-tertiary"> (required)</span> : null}
          </span>
        </label>
        {field.helpText ? <p id={`${id}-help`} className="pl-6.5 text-xs text-text-secondary">{field.helpText}</p> : null}
        {error ? <p id={`${id}-error`} className="pl-6.5 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {field.label}
        {field.required ? null : <span className="font-normal text-text-tertiary"> (optional)</span>}
      </label>
      {field.type === "textarea" ? (
        <Textarea {...common} rows={4} value={value} required={field.required} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : field.type === "select" ? (
        <select {...common} value={value} required={field.required} onChange={(e) => onChange(e.target.value)} className={SELECT_CLASS}>
          <option value="">{field.placeholder || "Choose…"}</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <Input
          {...common}
          type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
          autoComplete={field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.key === "first_name" ? "given-name" : field.key === "last_name" ? "family-name" : undefined}
          value={value}
          required={field.required}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.helpText ? <p id={`${id}-help`} className="text-xs text-text-secondary">{field.helpText}</p> : null}
      {error ? <p id={`${id}-error`} className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}

export function PublicForm({ form, preview = false, landingPageId = null, popupId = null, initialStatus = null, initialMessage = "", className }) {
  const fields = form?.fields || [];
  const [values, setValues] = useState(() => initialValues(fields));
  const [errors, setErrors] = useState({});
  const [state, setState] = useState(initialStatus === "success" || initialStatus === "confirm" ? "success" : "idle");
  const [message, setMessage] = useState(
    initialStatus === "confirm"
      ? "Almost done — check your inbox to confirm your subscription."
      : initialStatus === "success"
        ? form?.successMessage
        : initialStatus === "error"
          ? initialMessage || "Something went wrong. Try again."
          : "",
  );
  const startedAt = useRef(0);

  // Preview mirrors builder edits; a live form keeps whatever the visitor typed.
  const [prevFields, setPrevFields] = useState(fields);
  if (preview && prevFields !== fields) {
    setPrevFields(fields);
    setValues(initialValues(fields));
  }

  useEffect(() => {
    startedAt.current = Date.now();
    if (preview || !form?.id) return;
    const key = `gc_fv_${form.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Storage blocked: count the view anyway.
    }
    fetch(`${BASE_PATH}/api/public/forms/${form.id}/view`, { method: "POST", keepalive: true }).catch(() => {});
  }, [preview, form?.id]);

  if (!form) return null;
  const action = `${BASE_PATH}/api/public/forms/${form.id}/submit`;
  const submitting = state === "submitting";

  const set = (key) => (value) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (preview || submitting) return;
    const data = { ...values };
    for (const f of fields) if (f.type === "hidden" && f.param !== "static") data[f.key] = pageValue(f.param);
    const honeypot = event.currentTarget.elements.namedItem("_gc_hp")?.value || "";
    setState("submitting");
    setMessage("");
    try {
      const res = await fetch(action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: data,
          utm: pageUtm(),
          _gc_url: window.location.href,
          _gc_ref: document.referrer || "",
          _gc_hp: honeypot,
          _gc_ms: Date.now() - startedAt.current,
          landingPageId,
          popupId,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(body.fieldErrors || {});
        setState("idle");
        setMessage(body.error || "Something went wrong. Try again.");
        return;
      }
      if (body.redirectUrl && !body.confirmationRequired) {
        window.location.assign(body.redirectUrl);
        return;
      }
      setState("success");
      setMessage(body.message || form.successMessage);
    } catch {
      setState("idle");
      setMessage("Network error — check your connection and try again.");
    }
  };

  if (state === "success") {
    return (
      <div role="status" className={cn("flex items-start gap-3 rounded-lg border border-border bg-surface-card p-4", className)}>
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <p className="text-sm leading-6 text-foreground">{message || form.successMessage}</p>
      </div>
    );
  }

  return (
    <form action={action} method="post" noValidate onSubmit={onSubmit} className={cn("relative space-y-4", className)} aria-label={form.name}>
      {fields
        .filter((f) => f.type !== "hidden")
        .map((f) => (
          <FieldControl key={f.id} field={f} value={values[f.key]} error={errors[f.key]} disabled={submitting} onChange={set(f.key)} />
        ))}
      {fields
        .filter((f) => f.type === "hidden")
        .map((f) => (
          <input key={f.id} type="hidden" name={f.key} value={values[f.key] || ""} readOnly />
        ))}
      <input type="hidden" name="landingPageId" value={landingPageId || ""} readOnly />
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label>
          Leave this field empty
          <input type="text" name="_gc_hp" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      {form.consentText ? <p className="text-xs leading-5 text-text-secondary">{form.consentText}</p> : null}
      {message ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {message}
        </p>
      ) : null}
      <Button type="submit" className="w-full sm:w-auto" disabled={submitting} aria-disabled={preview || undefined}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {form.submitLabel || "Subscribe"}
      </Button>
    </form>
  );
}

export default PublicForm;
