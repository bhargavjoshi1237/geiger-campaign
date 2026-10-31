"use client";

import React from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui";
import { SecretValue } from "@/components/internal/screens/data/shared/code_block";

// The one time a full secret (API key, signing secret) is shown. `issued` = { title, name, value, note }.
export function SecretDialog({ issued, onClose }) {
  return (
    <Dialog open={!!issued} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{issued?.title || "Copy your secret"}</DialogTitle>
          <DialogDescription>
            {issued?.note || (
              <>
                This is the only time the full secret for <span className="font-medium text-foreground">{issued?.name}</span> is shown. Store it somewhere safe — it can&apos;t be
                recovered, only replaced.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {issued ? <SecretValue value={issued.value} /> : null}
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SecretDialog;
