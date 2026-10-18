"use client";

import React from "react";
import { Trash2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@geiger/ui";

// Shared button looks for the deliverability list + editor screens.
export const PRIMARY_BUTTON = "bg-primary text-primary-foreground hover:bg-primary/90";
export const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

// Delete confirmation used by every deliverability list row and editor.
export function DeleteDialog({ target, label, noun, onCancel, onConfirm }) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {noun}</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{label}</span>? This
            can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="bg-red-500/90 text-white hover:bg-red-500" onClick={() => onConfirm(target)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
