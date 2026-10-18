"use client";

import React from "react";
import { FileText, Image as ImageIcon, Palette, Send, Upload } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { EditorSections } from "@/components/internal/shared/editor_shell";
import { Button, Input, Textarea, ScreenHeader, SectionCard, Field } from "@geiger/ui";
import { SaveChangesButton, useSettingsForm } from "./settings_form";

const PRESETS = ["#6d28d9", "#2563eb", "#059669", "#dc2626", "#d97706", "#111827"];

const DEFAULTS = {
  brandColor: "#6d28d9",
  footer:
    "Halcyon Studio · Rua da Boavista 42, 1200-066 Lisbon, Portugal\nYou're receiving this because you subscribed to Halcyon updates. Unsubscribe at any time.",
  fromName: "Halcyon Studio",
  fromEmail: "hello@halcyon.studio",
};

const BRANDING_NAV = [
  { key: "logo", label: "Logo", icon: ImageIcon, desc: "Shown in the header of emails and hosted pages." },
  { key: "color", label: "Brand color", icon: Palette, desc: "The accent used on buttons and links." },
  { key: "footer", label: "Email footer", icon: FileText, desc: "Appears at the bottom of every email you send." },
  { key: "sender", label: "Default sender", icon: Send, desc: "Who new campaigns are sent from unless overridden." },
];

export function BrandingScreen() {
  const { form, set, dirty, saving, save } = useSettingsForm(DEFAULTS);

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Branding"
        description="Apply your brand across emails and hosted pages."
        actions={<SaveChangesButton dirty={dirty} saving={saving} onClick={save} />}
      />

      <EditorSections nav={BRANDING_NAV} defaultSection={BRANDING_NAV[0].key}>
        {({ active }) => (
          <>
            {active === "logo" ? (
              <SectionCard>
                <div className="flex items-center gap-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-card">
                    <ImageIcon className="h-7 w-7 text-text-secondary" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-text-secondary">
                      PNG or SVG, at least 256×256px. Shown in emails and hosted pages.
                    </p>
                    <Button variant="outline">
                      <Upload className="h-4 w-4" /> Replace logo
                    </Button>
                  </div>
                </div>
              </SectionCard>
            ) : null}

            {active === "color" ? (
              <SectionCard contentClassName="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Hex value" htmlFor="brand-color">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-9 w-9 shrink-0 rounded-lg border border-border"
                        style={{ backgroundColor: form.brandColor }}
                      />
                      <Input
                        id="brand-color"
                        value={form.brandColor}
                        onChange={(e) => set("brandColor")(e.target.value)}
                        className="font-mono"
                      />
                    </div>
                  </Field>
                  <Field label="Presets">
                    <div className="flex h-9 items-center gap-2">
                      {PRESETS.map((c) => (
                        <Button
                          key={c}
                          type="button"
                          variant="outline"
                          size="icon-xs"
                          onClick={() => set("brandColor")(c)}
                          aria-label={`Set color ${c}`}
                          className="size-7 transition-transform hover:scale-110"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </Field>
                </div>

                {/* Preview button text stays white on the user-chosen brand color */}
                <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-card px-4 py-3">
                  <span className="text-xs text-text-secondary">Preview</span>
                  <span
                    className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-white"
                    style={{ backgroundColor: form.brandColor }}
                  >
                    Shop now
                  </span>
                </div>
              </SectionCard>
            ) : null}

            {active === "footer" ? (
              <SectionCard>
                <Field
                  label="Footer text"
                  htmlFor="brand-footer"
                  hint="Include your address and an unsubscribe note."
                >
                  <Textarea
                    id="brand-footer"
                    value={form.footer}
                    onChange={(e) => set("footer")(e.target.value)}
                    rows={4}
                  />
                </Field>
              </SectionCard>
            ) : null}

            {active === "sender" ? (
              <SectionCard>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="From name" htmlFor="from-name">
                    <Input
                      id="from-name"
                      value={form.fromName}
                      onChange={(e) => set("fromName")(e.target.value)}
                    />
                  </Field>
                  <Field label="From email" htmlFor="from-email">
                    <Input
                      id="from-email"
                      type="email"
                      value={form.fromEmail}
                      onChange={(e) => set("fromEmail")(e.target.value)}
                    />
                  </Field>
                </div>
              </SectionCard>
            ) : null}
          </>
        )}
      </EditorSections>
    </MainScreenWrapper>
  );
}

export default BrandingScreen;
