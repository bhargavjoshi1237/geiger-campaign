import React from "react";
import { brandCssVars, googleFontsHref, normalizeHex, SOCIAL_KEYS } from "@/lib/content/brand";

// The frame every recipient-facing page shares (hosted forms, landing pages, surveys, confirmations):
// brand logo, the project's colours and fonts mapped onto the suite's semantic tokens, and the footer
// text + postal address from the brand kit. Server-safe (no hooks), so server pages render it directly.

function isDark(hex) {
  const v = normalizeHex(hex);
  if (!v) return null;
  const n = parseInt(v.slice(1), 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum < 0.45;
}

function Logo({ brand }) {
  const name = brand.displayName || "";
  const light = brand.logoUrl;
  const dark = brand.logoDarkUrl;
  if (!light && !dark) return name ? <span className="text-sm font-semibold text-foreground">{name}</span> : null;
  // A kit background fixes the scheme; otherwise follow the visitor's light/dark theme.
  const forcedDark = isDark(brand.backgroundColor);
  if (forcedDark !== null || !light || !dark) {
    const src = forcedDark ? dark || light : light || dark;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name || "Logo"} className="h-7 w-auto max-w-[180px] object-contain" />;
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={light} alt={name || "Logo"} className="h-7 w-auto max-w-[180px] object-contain dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dark} alt={name || "Logo"} className="hidden h-7 w-auto max-w-[180px] object-contain dark:block" />
    </>
  );
}

export function PublicShell({ brand = {}, width = "narrow", children }) {
  const fonts = googleFontsHref(brand);
  const socials = SOCIAL_KEYS.filter((s) => /^https?:\/\//i.test(brand.socialLinks?.[s.key] || ""));
  const max = width === "wide" ? "max-w-3xl" : "max-w-xl";
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground" style={brandCssVars(brand)}>
      {fonts ? <link rel="stylesheet" href={fonts} precedence="default" /> : null}
      <header className="border-b border-border">
        <div className={`mx-auto flex h-14 w-full ${max} items-center px-4`}>
          <Logo brand={brand} />
        </div>
      </header>
      <main id="main" className={`mx-auto w-full ${max} flex-1 px-4 py-10 sm:py-14`}>
        {children}
      </main>
      {brand.footerText || brand.companyAddress || socials.length ? (
        <footer className="border-t border-border">
          <div className={`mx-auto w-full ${max} space-y-2 px-4 py-6 text-xs leading-5 text-text-secondary`}>
            {brand.footerText ? <p className="whitespace-pre-line">{brand.footerText}</p> : null}
            {brand.companyAddress ? <p className="whitespace-pre-line">{brand.companyAddress}</p> : null}
            {socials.length ? (
              <nav aria-label="Social links" className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                {socials.map((s) => (
                  <a key={s.key} href={brand.socialLinks[s.key]} rel="noopener noreferrer" target="_blank" className="underline-offset-4 hover:text-foreground hover:underline">
                    {s.label}
                  </a>
                ))}
              </nav>
            ) : null}
          </div>
        </footer>
      ) : null}
    </div>
  );
}

// A one-message page: unavailable form, closed survey, confirmation result.
export function PublicMessage({ brand, title, children }) {
  return (
    <PublicShell brand={brand}>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground" style={{ fontFamily: "var(--brand-font-heading, inherit)" }}>
          {title}
        </h1>
        {children ? <div className="text-sm leading-6 text-muted-foreground">{children}</div> : null}
      </div>
    </PublicShell>
  );
}

export default PublicShell;
