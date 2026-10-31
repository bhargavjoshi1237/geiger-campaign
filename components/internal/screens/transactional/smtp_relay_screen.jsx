"use client";

import React, { useState } from "react";
import { ArrowRight, Server } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { Badge, Button, ScreenHeader, SectionCard, SegmentedTabs, SettingRow, SettingsList } from "@geiger/ui";
import { CodeBlock, CopyField, NotConnectedCard, SectionLoading, useChannelStatus } from "@/components/internal/screens/channels/channels_kit";

// Honest state of SMTP: this stack runs no SMTP listener — every email leaves through Geiger Dash's HTTPS
// API — so there are no SMTP credentials to issue. The screen shows the real delivery path and how to move
// an SMTP integration onto POST /api/v1/messages.

const LANG_TABS = [
  { value: "node", label: "Node.js" },
  { value: "python", label: "Python" },
];

function snippets(url) {
  const endpoint = url || "https://<your-deployment>/api/v1/messages";
  return {
    node: `// Before: nodemailer.createTransport({ host, port, auth }).sendMail({ from, to, subject, html })
// After: the same call shape over HTTPS — one recipient per request.
export async function sendMail({ from, to, subject, html, idempotencyKey }) {
  const res = await fetch("${endpoint}", {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${process.env.GEIGER_SECRET_KEY}\`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || \`Send failed (\${res.status})\`);
  return body; // { id, status }
}`,
    python: `# Before: smtplib.SMTP(host, port).send_message(msg)
# After: one HTTPS request per recipient.
import os, requests

def send_mail(sender, to, subject, html, idempotency_key=None):
    headers = {"Authorization": f"Bearer {os.environ['GEIGER_SECRET_KEY']}"}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    res = requests.post("${endpoint}", headers=headers, timeout=15,
                        json={"from": sender, "to": to, "subject": subject, "html": html})
    res.raise_for_status()
    return res.json()  # {"id": ..., "status": ...}`,
  };
}

export function SmtpRelayScreen() {
  const { openRecordInTab } = useWorkspaceUrl();
  const { status, loading } = useChannelStatus();
  const [lang, setLang] = useState("node");
  const configured = Boolean(status?.email?.configured);
  const code = snippets(status?.urls?.messagesApi);

  return (
    <MainScreenWrapper>
      <ScreenHeader title="SMTP Relay" description="What this deployment offers instead of SMTP, and how to switch an SMTP integration over." />

      {loading ? (
        <SectionLoading label="Checking email delivery" />
      ) : (
        <>
          <NotConnectedCard
            icon={Server}
            title="No SMTP relay on this deployment"
            description="Geiger Campaign doesn't run an SMTP server, so there are no hosts, ports or SMTP credentials to issue. Campaign, automation and transactional email all leave through Geiger Dash's HTTPS API — send from your apps with the Email API instead."
            action={
              <Button onClick={() => openRecordInTab(null, "Email API")}>
                Open the Email API <ArrowRight className="h-4 w-4" />
              </Button>
            }
          />

          <SectionCard title="How email leaves" description="The one delivery path every send uses.">
            <SettingsList>
              <SettingRow
                title="Geiger Dash email API"
                description={configured ? `Pre-rendered messages are posted to ${status.email.apiHost}, which delivers them.` : "GEIGER_EMAIL_API_URL and GEIGER_EMAIL_API_KEY aren't set, so email can't be sent yet."}
                control={<Badge variant={configured ? "success" : "warning"}>{configured ? "Configured" : "Not configured"}</Badge>}
              />
              <SettingRow title="SMTP" description="No listener runs in this stack; nothing accepts SMTP connections." control={<Badge variant="neutral">Not available</Badge>} />
            </SettingsList>
          </SectionCard>

          <SectionCard title="Move an SMTP integration to the API" description="Swap the SMTP transport for one HTTPS call. Use a secret key with the messages:send scope." contentClassName="space-y-4">
            <CopyField label="Endpoint" value={status?.urls?.messagesApi ? `POST ${status.urls.messagesApi}` : ""} htmlFor="smtp-endpoint" />
            <SegmentedTabs tabs={LANG_TABS} value={lang} onChange={setLang} />
            <CodeBlock label="snippet">{code[lang]}</CodeBlock>
            <p className="text-xs text-text-secondary">
              Tools that can only send over SMTP (and can&apos;t make an HTTPS request) can&apos;t relay through Geiger today — keep those on your own SMTP provider.
            </p>
          </SectionCard>
        </>
      )}
    </MainScreenWrapper>
  );
}

export default SmtpRelayScreen;
