"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Odometer-style rolling number, shared with the overview screen so stat tiles
// animate consistently across the workspace.
const ROLL_DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function RollingDigit({ digit, active, delay }) {
  return (
    <span className="relative inline-block h-[1em] w-[1ch] overflow-hidden align-baseline">
      <span
        className="absolute inset-x-0 top-0 flex flex-col transition-transform duration-[900ms] ease-out"
        style={{
          transform: `translateY(-${(active ? digit : 0) * 10}%)`,
          transitionDelay: `${delay}ms`,
        }}
      >
        {ROLL_DIGITS.map((n) => (
          <span key={n} className="flex h-[1em] items-center justify-center leading-none">
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}

export function RollingNumber({ value, className }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setActive(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const chars = String(value).split("");
  let digitIndex = 0;

  return (
    <span className={cn("inline-flex items-center leading-none tabular-nums", className)}>
      {chars.map((char, i) => {
        if (/\d/.test(char)) {
          const delay = digitIndex * 70;
          digitIndex += 1;
          return <RollingDigit key={i} digit={Number(char)} active={active} delay={delay} />;
        }
        return (
          <span key={i} className="inline-flex h-[1em] items-center leading-none">
            {char}
          </span>
        );
      })}
    </span>
  );
}

// Standard screen header used across every secondary workspace screen.
// - title + small mono tag (defaults to "AUDIENCE"-style section label)
// - description line
// - optional right-aligned stat tiles
// - optional action node (primary button, etc.)
export function ScreenHeader({ title, tag, description, stats, actions }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
            {tag && (
              <span className="shrink-0 rounded border border-border bg-surface-subtle px-1.5 py-0.5 font-mono text-[9px] tracking-widest text-text-secondary">
                {tag}
              </span>
            )}
          </div>
          {description && (
            <p className="mt-2 max-w-xl text-sm text-foreground0">{description}</p>
          )}
        </div>

        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          {stats && stats.length > 0 && (
            <div className="flex">
              {stats.map((stat, i) => (
                <div
                  key={stat.label}
                  className={cn(
                    "flex flex-1 flex-col items-center sm:flex-none sm:px-6",
                    i > 0 && "border-l border-border",
                  )}
                >
                  <span className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                    {stat.label}
                  </span>
                  <RollingNumber value={stat.value} className="mt-0.5 text-2xl font-bold text-white" />
                </div>
              ))}
            </div>
          )}
          {actions}
        </div>
      </div>
    </div>
  );
}

export default ScreenHeader;
