"use client";

import React, { useState } from "react";
import { Image as ImageIcon, Palette, Check, Upload } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const PRESETS = ["#6d28d9", "#2563eb", "#059669", "#dc2626", "#d97706", "#111827"];

export function BrandingScreen() {
  const [brandColor, setBrandColor] = useState("#6d28d9");
  const [footer, setFooter] = useState(
    "Acme Inc. · 142 Market Street, Suite 300, San Francisco, CA 94103\nYou're receiving this because you subscribed to Acme updates. Unsubscribe at any time."
  );
  const [fromName, setFromName] = useState("Acme Team");
  const [fromEmail, setFromEmail] = useState("hello@acme.com");

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Branding"
        description="Apply your brand across emails and hosted pages."
      />

      <div className="space-y-4 border-t border-[#242424] pt-4">
        {/* Logo */}
        <div className="space-y-4 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
          <h2 className="text-sm font-semibold text-[#ededed]">Logo</h2>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-[#2a2a2a] bg-[#202020]">
              <ImageIcon className="h-7 w-7 text-[#737373]" />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-[#737373]">PNG or SVG, at least 256×256px. Shown in emails and hosted pages.</p>
              <Button variant="outline" className="h-9 border-[#2a2a2a] bg-[#202020] text-[#ededed] hover:bg-[#1a1a1a]">
                <Upload className="h-4 w-4" /> Replace logo
              </Button>
            </div>
          </div>
        </div>

        {/* Brand color */}
        <div className="space-y-4 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-[#737373]" />
            <h2 className="text-sm font-semibold text-[#ededed]">Brand color</h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="h-10 w-10 shrink-0 rounded-lg border border-[#2a2a2a]" style={{ backgroundColor: brandColor }} />
            <Input
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="max-w-[140px] bg-[#161616] border-[#2a2a2a] font-mono"
            />
            <div className="flex items-center gap-2">
              {PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setBrandColor(c)}
                  aria-label={`Set color ${c}`}
                  className="h-7 w-7 rounded-md border border-[#2a2a2a] transition-transform hover:scale-110"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-[#2a2a2a] bg-[#202020] px-4 py-3">
            <span className="text-xs text-[#737373]">Preview</span>
            <span
              className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-white"
              style={{ backgroundColor: brandColor }}
            >
              Shop now
            </span>
          </div>
        </div>

        {/* Email footer */}
        <div className="space-y-4 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
          <h2 className="text-sm font-semibold text-[#ededed]">Email footer</h2>
          <Field label="Footer text" hint="Appears at the bottom of every email. Include your address and an unsubscribe note.">
            <Textarea
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              rows={3}
              className="bg-[#161616] border-[#2a2a2a]"
            />
          </Field>
        </div>

        {/* Default sender */}
        <div className="space-y-4 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
          <h2 className="text-sm font-semibold text-[#ededed]">Default sender</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="From name" htmlFor="from-name">
              <Input id="from-name" value={fromName} onChange={(e) => setFromName(e.target.value)} className="bg-[#161616] border-[#2a2a2a]" />
            </Field>
            <Field label="From email" htmlFor="from-email">
              <Input id="from-email" type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} className="bg-[#161616] border-[#2a2a2a]" />
            </Field>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end">
          <Button className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Check className="h-4 w-4" /> Save changes
          </Button>
        </div>
      </div>
    </MainScreenWrapper>
  );
}

export default BrandingScreen;
