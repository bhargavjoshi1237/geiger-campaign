import React from "react";
import { buttonVariants, cn } from "@geiger/ui";
import { PublicForm } from "./public_form";

// Renders a landing page's blocks: the public /p/<slug> page and the builder's live preview share it, so
// what the builder shows is what visitors get. Server-safe (no hooks); form blocks hydrate PublicForm.

const HEADING_FONT = { fontFamily: "var(--brand-font-heading, inherit)" };

function paragraphs(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function safeHref(href) {
  const h = String(href || "").trim();
  if (!h) return null;
  if (h.startsWith("#") || /^https?:\/\//i.test(h) || h.startsWith("/") || h.startsWith("mailto:")) return h;
  return null;
}

function Cta({ label, href, variant = "default" }) {
  const target = safeHref(href);
  if (!label || !target) return null;
  return (
    <a href={target} className={cn(buttonVariants({ variant, size: "lg" }), "no-underline")}>
      {label}
    </a>
  );
}

function Hero({ props }) {
  const center = props.align === "center";
  return (
    <section className={cn("space-y-5 py-10 sm:py-14", center && "text-center")}>
      {props.eyebrow ? <p className="text-sm font-medium text-primary">{props.eyebrow}</p> : null}
      <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl" style={HEADING_FONT}>
        {props.heading}
      </h1>
      {props.subheading ? <p className={cn("max-w-2xl text-lg leading-8 text-muted-foreground", center && "mx-auto")}>{props.subheading}</p> : null}
      {props.ctaLabel ? (
        <div className={cn("pt-1", center && "flex justify-center")}>
          <Cta label={props.ctaLabel} href={props.ctaHref} />
        </div>
      ) : null}
      {props.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={props.imageUrl} alt={props.imageAlt || ""} className="mt-4 w-full rounded-xl border border-border object-cover" />
      ) : null}
    </section>
  );
}

function TextBlock({ props }) {
  return (
    <section className="space-y-4 py-8">
      {props.heading ? (
        <h2 className="text-2xl font-semibold tracking-tight text-foreground" style={HEADING_FONT}>
          {props.heading}
        </h2>
      ) : null}
      {paragraphs(props.body).map((p, i) => (
        <p key={i} className="whitespace-pre-line text-base leading-7 text-muted-foreground">
          {p}
        </p>
      ))}
    </section>
  );
}

function ImageBlock({ props, preview }) {
  if (!props.url) {
    return preview ? (
      <section className="py-8">
        <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-border text-sm text-text-tertiary">No image chosen</div>
      </section>
    ) : null;
  }
  return (
    <figure className="space-y-2 py-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={props.url} alt={props.alt || ""} className="w-full rounded-xl border border-border object-cover" />
      {props.caption ? <figcaption className="text-sm text-text-secondary">{props.caption}</figcaption> : null}
    </figure>
  );
}

function FeaturesBlock({ props }) {
  const items = (props.items || []).filter((i) => i.title || i.body);
  return (
    <section className="space-y-6 py-8">
      {props.heading ? (
        <h2 className="text-2xl font-semibold tracking-tight text-foreground" style={HEADING_FONT}>
          {props.heading}
        </h2>
      ) : null}
      <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {items.map((item, i) => (
          <div key={i} className="space-y-1 border-t border-border pt-4">
            <dt className="font-medium text-foreground">{item.title}</dt>
            <dd className="text-sm leading-6 text-muted-foreground">{item.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function CtaBlock({ props }) {
  return (
    <section className="space-y-4 border-t border-border py-10">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground" style={HEADING_FONT}>
        {props.heading}
      </h2>
      {props.body ? <p className="max-w-2xl text-base leading-7 text-muted-foreground">{props.body}</p> : null}
      <Cta label={props.buttonLabel} href={props.buttonHref} />
    </section>
  );
}

function FormBlock({ props, form, preview, landingPageId, anchor }) {
  return (
    <section id={anchor && !preview ? "form" : undefined} className="scroll-mt-8 py-8">
      <div className="space-y-5 rounded-xl border border-border bg-surface-subtle p-5 sm:p-6">
        {props.heading || props.description ? (
          <div className="space-y-1">
            {props.heading ? (
              <h2 className="text-xl font-semibold tracking-tight text-foreground" style={HEADING_FONT}>
                {props.heading}
              </h2>
            ) : null}
            {props.description ? <p className="text-sm leading-6 text-muted-foreground">{props.description}</p> : null}
          </div>
        ) : null}
        {form ? (
          <PublicForm form={form} preview={preview} landingPageId={landingPageId} />
        ) : (
          <p className="text-sm text-text-secondary">{preview ? "Choose a live form for this block." : "This form isn't accepting submissions right now."}</p>
        )}
      </div>
    </section>
  );
}

// `forms` maps form id -> public form view; `pageFormId` fills form blocks without their own form.
export function LandingPageView({ page, forms = {}, preview = false }) {
  const anchorId = (page?.blocks || []).find((b) => b.type === "form")?.id;
  return (
    <div className="flex flex-col">
      {(page?.blocks || []).map((block) => {
        const props = block.props || {};
        switch (block.type) {
          case "hero":
            return <Hero key={block.id} props={props} />;
          case "text":
            return <TextBlock key={block.id} props={props} />;
          case "image":
            return <ImageBlock key={block.id} props={props} preview={preview} />;
          case "features":
            return <FeaturesBlock key={block.id} props={props} />;
          case "cta":
            return <CtaBlock key={block.id} props={props} />;
          case "form":
            return (
              <FormBlock
                key={block.id}
                props={props}
                form={forms[props.formId || page.formId]}
                preview={preview}
                landingPageId={page.id}
                anchor={block.id === anchorId}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

export default LandingPageView;
