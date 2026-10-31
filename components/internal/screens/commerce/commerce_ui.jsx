"use client";

import React from "react";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  cn,
} from "@geiger/ui";
import { DANGER_BUTTON, OUTLINE_BUTTON, copyText, initials } from "./constants";

// Small pieces the commerce screens share: read-only values, copyable fields, product thumbnails and
// the destructive confirm dialog.

export function ReadOnly({ children, className }) {
  return <span className={cn("text-sm tabular-nums text-foreground", className)}>{children}</span>;
}

export function CopyField({ value, label, mono = true, className }) {
  const copy = async () => {
    if (await copyText(value)) toast.success(`${label} copied.`);
    else toast.error(`Couldn't copy the ${label.toLowerCase()}.`);
  };
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Input readOnly value={value} aria-label={label} className={cn("bg-surface-card", mono && "font-mono text-xs")} onFocus={(e) => e.target.select()} />
      <Button type="button" variant="outline" size="icon" className={cn("shrink-0", OUTLINE_BUTTON)} aria-label={`Copy ${label.toLowerCase()}`} onClick={copy}>
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function ProductThumb({ imageUrl, title, size = "h-9 w-9" }) {
  if (imageUrl) {
    return (
      <span className={cn("shrink-0 overflow-hidden rounded-lg border border-border bg-surface-active", size)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      </span>
    );
  }
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-xs font-medium text-muted-foreground", size)}>
      {initials(title)}
    </span>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, icon: Icon, onConfirm, pending = false }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className={DANGER_BUTTON} disabled={pending} onClick={onConfirm}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ListEmpty({ icon, title, description, action }) {
  return (
    <div className="rounded-xl border border-border bg-surface-subtle">
      <EmptyState icon={icon} title={title} description={description} action={action} />
    </div>
  );
}
