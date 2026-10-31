"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Textarea,
} from "@geiger/ui";
import { sendCampaignTest } from "@/lib/campaigns/api";
import { EMAIL_PATTERN } from "./inbox_section";

const parse = (text) =>
  String(text || "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

function SendTestForm({ projectId, campaignId, defaultTo, beforeSend, onClose }) {
  const [to, setTo] = useState(defaultTo || "");
  const [sending, setSending] = useState(false);
  const list = parse(to);
  const invalid = list.filter((a) => !EMAIL_PATTERN.test(a));

  const send = async () => {
    if (!list.length || invalid.length) return;
    setSending(true);
    if (beforeSend && !(await beforeSend())) {
      setSending(false);
      return;
    }
    const res = await sendCampaignTest(projectId, campaignId, list);
    setSending(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't send the test.");
      return;
    }
    const sent = Number(res.data?.sent) || 0;
    const failed = Number(res.data?.failed) || 0;
    if (sent) toast.success(`Test sent to ${sent} ${sent === 1 ? "address" : "addresses"}${failed ? `; ${failed} failed` : ""}.`);
    else toast.error(failed ? `The test failed for ${failed} ${failed === 1 ? "address" : "addresses"}.` : "No test was sent.");
    if (sent) onClose();
  };

  return (
    <>
      <Field label="Send to" htmlFor="test-to" hint={invalid.length ? `Not an email address: ${invalid.join(", ")}` : "Up to 10 addresses, separated by commas. Merge tags use each address's contact data when it has any."}>
        <Textarea id="test-to" rows={3} value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@yourdomain.com" autoFocus />
      </Field>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={send} disabled={!list.length || invalid.length > 0 || list.length > 10 || sending}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send test
        </Button>
      </DialogFooter>
    </>
  );
}

// `beforeSend` (e.g. save unsaved changes) runs first and can cancel by returning false.
export function SendTestDialog({ open, onOpenChange, projectId, campaignId, defaultTo, beforeSend }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send a test email</DialogTitle>
          <DialogDescription>Delivers the saved version of this campaign. Tests don&apos;t count toward the report.</DialogDescription>
        </DialogHeader>
        {open ? <SendTestForm projectId={projectId} campaignId={campaignId} defaultTo={defaultTo} beforeSend={beforeSend} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

export default SendTestDialog;
