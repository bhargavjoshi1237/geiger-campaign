"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Loader2 } from "lucide-react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@geiger/ui";
import { socialApi } from "@/lib/social/accounts/api";
import { META_SCOPES, tiktokRegionRestricted } from "@/lib/social/accounts/catalog";

// Connect flows for each social channel: Meta and TikTok hand off to the platform's OAuth dialog; Telegram and
// RCS take credentials here and are validated server-side before anything is stored.

const PRIMARY = "bg-primary text-primary-foreground hover:bg-primary/90";

// Countries offered for the TikTok business account region (TikTok messaging is refused in the EEA/CH/UK).
const COUNTRIES = [
  ["US", "United States"], ["CA", "Canada"], ["MX", "Mexico"], ["BR", "Brazil"], ["AR", "Argentina"], ["CO", "Colombia"],
  ["CL", "Chile"], ["PE", "Peru"], ["AU", "Australia"], ["NZ", "New Zealand"], ["JP", "Japan"], ["KR", "South Korea"],
  ["SG", "Singapore"], ["MY", "Malaysia"], ["ID", "Indonesia"], ["TH", "Thailand"], ["VN", "Vietnam"], ["PH", "Philippines"],
  ["IN", "India"], ["AE", "United Arab Emirates"], ["SA", "Saudi Arabia"], ["TR", "Türkiye"], ["EG", "Egypt"], ["ZA", "South Africa"],
  ["NG", "Nigeria"], ["KE", "Kenya"], ["IL", "Israel"], ["PT", "Portugal"], ["ES", "Spain"], ["FR", "France"], ["DE", "Germany"],
  ["IT", "Italy"], ["NL", "Netherlands"], ["IE", "Ireland"], ["SE", "Sweden"], ["PL", "Poland"], ["CH", "Switzerland"], ["GB", "United Kingdom"],
];

function CodeLine({ label, value }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-text-secondary">{label}</span>
      <code className="break-all rounded-md border border-border bg-surface-card px-2 py-1.5 font-mono text-xs text-foreground">{value}</code>
    </div>
  );
}

// What the deployment is missing for a channel, or null when it can connect.
export function setupGap(channel, config) {
  if (!config) return null;
  if (config.playground) return "Connecting real accounts isn't available in the playground — the accounts here are sample data.";
  if (config.error) return config.error;
  if (!config.serverDb) return "SUPABASE_SERVICE_ROLE_KEY isn't set, so credentials can't be stored on the server.";
  if ((channel === "instagram" || channel === "messenger") && !config.meta?.configured) {
    return config.meta?.appConfigured ? "CAMPAIGN_SIGNING_SECRET isn't set, so the Facebook login can't be secured." : "The Meta app isn't configured: set META_APP_ID, META_APP_SECRET and META_WEBHOOK_VERIFY_TOKEN.";
  }
  if (channel === "tiktok" && !config.tiktok?.configured) {
    return config.tiktok?.appConfigured ? "CAMPAIGN_SIGNING_SECRET isn't set, so the TikTok login can't be secured." : "The TikTok app isn't configured: set TIKTOK_APP_ID and TIKTOK_APP_SECRET.";
  }
  return null;
}

export function SetupNotice({ channel, config }) {
  const gap = setupGap(channel, config);
  if (!gap) return null;
  const meta = channel === "instagram" || channel === "messenger";
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-5 py-4">
      <p className="text-sm font-medium text-amber-700 dark:text-amber-300">{gap}</p>
      {!config.playground && (meta || channel === "tiktok") ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <CodeLine label="OAuth redirect URI" value={meta ? config.meta?.redirectUri : config.tiktok?.redirectUri} />
          <CodeLine label="Webhook callback URL" value={meta ? config.meta?.webhookUrl : config.tiktok?.webhookUrl} />
        </div>
      ) : null}
    </div>
  );
}

function MetaConnectDialog({ open, onOpenChange, channel, projectId, tab, config }) {
  const other = channel === "instagram" ? "messenger" : "instagram";
  const [both, setBoth] = useState(true);
  const [pending, setPending] = useState(false);
  const gap = setupGap(channel, config);
  const channels = both ? [channel, other] : [channel];
  const scopes = [...new Set(channels.flatMap((c) => META_SCOPES[c].required))];
  const optional = [...new Set(channels.flatMap((c) => META_SCOPES[c].optional))].filter((s) => !scopes.includes(s));

  const start = async () => {
    setPending(true);
    const res = await socialApi.startMeta(projectId, { channels, tab });
    if (!res.ok || !res.data?.url) {
      setPending(false);
      toast.error(res.error || "Couldn't start the Facebook login.");
      return;
    }
    window.location.assign(res.data.url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect {channel === "instagram" ? "Instagram" : "a Facebook Page"}</DialogTitle>
          <DialogDescription>
            You&apos;ll sign in with Facebook and pick the Pages to share. {channel === "instagram" ? "Each Page's linked Instagram professional account is connected." : "Each Page is connected for Messenger and comments."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <label className="flex items-start gap-3 text-sm text-foreground">
            <Checkbox checked={both} onCheckedChange={(v) => setBoth(Boolean(v))} className="mt-0.5" />
            <span>
              Also connect {other === "messenger" ? "Messenger for the same Pages" : "the Pages' linked Instagram accounts"}
              <span className="block text-xs text-text-secondary">One login covers both; you can disconnect either later.</span>
            </span>
          </label>
          <div className="rounded-lg border border-border bg-surface-card px-3 py-2.5">
            <p className="text-xs font-medium text-muted-foreground">Permissions requested</p>
            <p className="mt-1 font-mono text-xs leading-relaxed text-text-secondary">{scopes.join(", ")}</p>
            <p className="mt-2 text-xs font-medium text-muted-foreground">Optional — publishing, insights, lead ads and ad comments</p>
            <p className="mt-1 font-mono text-xs leading-relaxed text-text-secondary">{optional.join(", ")}</p>
          </div>
          {gap ? <p className="text-sm text-amber-700 dark:text-amber-300">{gap}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className={PRIMARY} disabled={Boolean(gap) || pending} onClick={start}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Continue with Facebook
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TelegramConnectDialog({ open, onOpenChange, projectId, config, onConnected }) {
  const [token, setToken] = useState("");
  const [brand, setBrand] = useState("");
  const [pending, setPending] = useState(false);
  const gap = setupGap("telegram", config);

  const submit = async () => {
    if (!token.trim()) {
      toast.error("Paste the bot token from @BotFather.");
      return;
    }
    setPending(true);
    const res = await socialApi.connectTelegram(projectId, { token: token.trim(), brand: brand.trim() });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't connect the bot.");
      return;
    }
    setToken("");
    setBrand("");
    onOpenChange(false);
    toast.success(`Connected ${res.data.connection?.display_handle || "the bot"}.`);
    onConnected?.(res.data.connection);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a Telegram bot</DialogTitle>
          <DialogDescription>In Telegram, open @BotFather and send /newbot (or /token for an existing bot), then paste the token here.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="Bot token" htmlFor="tg-token" hint="Stored encrypted on the server. This replaces any webhook the bot already uses.">
            <Input id="tg-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456789:AA…" autoFocus />
          </Field>
          <Field label="Brand" htmlFor="tg-brand" hint="Groups the bot with your other accounts. Defaults to the bot's name.">
            <Input id="tg-brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Halcyon Studio" />
          </Field>
          {gap ? <p className="text-sm text-amber-700 dark:text-amber-300">{gap}</p> : null}
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className={PRIMARY} disabled={Boolean(gap) || pending || !token.trim()} onClick={submit}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Connect bot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TikTokConnectDialog({ open, onOpenChange, projectId, tab, config, initialRegion }) {
  const [region, setRegion] = useState(initialRegion || "");
  const [pending, setPending] = useState(false);
  const gap = setupGap("tiktok", config);
  const restricted = tiktokRegionRestricted(region);

  const start = async () => {
    setPending(true);
    const res = await socialApi.startTikTok(projectId, { region, tab });
    if (!res.ok || !res.data?.url) {
      setPending(false);
      toast.error(res.error || "Couldn't start the TikTok login.");
      return;
    }
    window.location.assign(res.data.url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect a TikTok business account</DialogTitle>
          <DialogDescription>TikTok&apos;s messaging API works with Business accounts only, and isn&apos;t offered in the EEA, Switzerland or the UK.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Where is the business account registered?">
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose a country" /></SelectTrigger>
              <SelectContent>
                {COUNTRIES.map(([code, label]) => (
                  <SelectItem key={code} value={code}>
                    {label}{tiktokRegionRestricted(code) ? " — not available" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {restricted ? (
            <p className="text-sm text-red-600 dark:text-red-400">TikTok doesn&apos;t offer business messaging for accounts registered here, so it can&apos;t be connected.</p>
          ) : null}
          {gap ? <p className="text-sm text-amber-700 dark:text-amber-300">{gap}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className={PRIMARY} disabled={Boolean(gap) || pending || !region || restricted} onClick={start}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Continue with TikTok
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const EMPTY_RCS = { agentId: "", displayName: "", brandId: "", brand: "", region: "global", serviceAccount: "", webhookClientToken: "", basic: "", rich: "", currency: "USD" };

function RcsConnectDialog({ open, onOpenChange, projectId, config, onConnected }) {
  const [form, setForm] = useState(EMPTY_RCS);
  const [pending, setPending] = useState(false);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const gap = setupGap("rcs", config);

  const submit = async () => {
    if (!form.agentId.trim() || !form.serviceAccount.trim()) {
      toast.error("The agent id and the service account key are required.");
      return;
    }
    setPending(true);
    const res = await socialApi.connectRcs(projectId, {
      agentId: form.agentId.trim(),
      displayName: form.displayName.trim(),
      brandId: form.brandId.trim(),
      brand: form.brand.trim(),
      region: form.region,
      serviceAccount: form.serviceAccount,
      webhookClientToken: form.webhookClientToken.trim(),
      rates: { basic: form.basic, rich: form.rich, currency: form.currency },
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't connect the agent.");
      return;
    }
    setForm(EMPTY_RCS);
    onOpenChange(false);
    toast.success("RCS agent connected.");
    onConnected?.(res.data.connection);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect an RCS agent</DialogTitle>
          <DialogDescription>Use an RBM agent from the Google Business Communications console and its service account key.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Agent id" htmlFor="rcs-agent">
              <Input id="rcs-agent" value={form.agentId} onChange={(e) => set("agentId")(e.target.value)} placeholder="halcyon_updates_agent" autoFocus />
            </Field>
            <Field label="Display name" htmlFor="rcs-name">
              <Input id="rcs-name" value={form.displayName} onChange={(e) => set("displayName")(e.target.value)} placeholder="Halcyon Studio" />
            </Field>
            <Field label="Brand id" htmlFor="rcs-brand-id" hint="Optional — lets us read the launch state.">
              <Input id="rcs-brand-id" value={form.brandId} onChange={(e) => set("brandId")(e.target.value)} placeholder="brands/…" />
            </Field>
            <Field label="API region">
              <Select value={form.region} onValueChange={set("region")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global</SelectItem>
                  <SelectItem value="europe">Europe</SelectItem>
                  <SelectItem value="asia">Asia Pacific</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Service account key (JSON)" htmlFor="rcs-sa" hint="Validated by signing in to Google before it's stored on the server.">
            <Textarea id="rcs-sa" rows={4} className="font-mono text-xs" value={form.serviceAccount} onChange={(e) => set("serviceAccount")(e.target.value)} placeholder='{ "type": "service_account", "client_email": "…", "private_key": "…" }' />
          </Field>
          <Field label="Webhook client token" htmlFor="rcs-token" hint="The token you set on the agent's webhook, used to verify replies and receipts.">
            <Input id="rcs-token" value={form.webhookClientToken} onChange={(e) => set("webhookClientToken")(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Basic message rate" htmlFor="rcs-basic">
              <Input id="rcs-basic" inputMode="decimal" value={form.basic} onChange={(e) => set("basic")(e.target.value)} placeholder="0.0075" />
            </Field>
            <Field label="Rich message rate" htmlFor="rcs-rich">
              <Input id="rcs-rich" inputMode="decimal" value={form.rich} onChange={(e) => set("rich")(e.target.value)} placeholder="0.0100" />
            </Field>
            <Field label="Currency" htmlFor="rcs-currency">
              <Input id="rcs-currency" value={form.currency} onChange={(e) => set("currency")(e.target.value.toUpperCase().slice(0, 3))} />
            </Field>
          </div>
          <p className="text-xs text-text-secondary">Rates come from your RCS aggregator and power the cost preview; leave them blank if you don&apos;t know them yet.</p>
          {gap ? <p className="text-sm text-amber-700 dark:text-amber-300">{gap}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className={PRIMARY} disabled={Boolean(gap) || pending} onClick={submit}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Connect agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// One entry point for every channel's connect flow.
export function ConnectDialog({ channel, ...props }) {
  if (!channel) return null;
  if (channel === "instagram" || channel === "messenger") return <MetaConnectDialog channel={channel} {...props} />;
  if (channel === "telegram") return <TelegramConnectDialog {...props} />;
  if (channel === "tiktok") return <TikTokConnectDialog {...props} />;
  if (channel === "rcs") return <RcsConnectDialog {...props} />;
  return null;
}
