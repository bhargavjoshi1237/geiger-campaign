"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Lightbulb, Loader2, Palette, Send, Sparkles } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  EmptyState,
  Field,
  LogoLoading,
  ScreenHeader,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  Textarea,
} from "@geiger/ui";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { apiPost } from "@/lib/api/client";
import { BASE_MERGE_TOKENS, CONTENT_TYPES, checkCopy } from "@/lib/ai/checks";
import { LENGTHS, TONES } from "@/lib/ai/options";
import { getBrandKit } from "@/lib/supabase/brand_kits";
import { listCustomFields } from "@/lib/supabase/custom_fields";
import {
  AiStatusNotice,
  ApplyToCampaignDialog,
  ChecksBadge,
  ChecksList,
  HistoryCard,
  OUTLINE_BUTTON,
  copyText,
  formatWhen,
  useAiStatus,
  useGenerations,
} from "./ai_shared";

const TYPE_LABEL = Object.fromEntries(CONTENT_TYPES.map((t) => [t.value, t.label]));
// Content types that map onto a campaign the copy can be applied to.
const APPLY_CHANNEL = { email: "email", sms: "sms", whatsapp: "whatsapp" };

function VariantEditor({ variant, contentType, knownTokens, canApply, onApply }) {
  const [text, setText] = useState(variant.text);
  const result = useMemo(() => checkCopy(text, { contentType, knownTokens }), [text, contentType, knownTokens]);
  const edited = text !== variant.text;
  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface-subtle p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{variant.label}</p>
          {variant.angle ? <p className="truncate text-xs text-text-tertiary">{variant.angle}</p> : null}
        </div>
        <ChecksBadge checks={result.checks} />
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label={`${variant.label} copy`}
        className="mt-3 min-h-40 flex-1 bg-background text-sm leading-relaxed"
      />
      <p className="mt-1.5 text-xs tabular-nums text-text-tertiary">
        {result.sms ? `${result.sms.units} characters · ${result.sms.segments} segment${result.sms.segments === 1 ? "" : "s"}` : `${result.length} characters · ${result.words} words`}
        {edited ? " · edited" : ""}
      </p>
      <ChecksList checks={result.checks} className="mt-3" />
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button size="sm" variant="outline" className={OUTLINE_BUTTON} onClick={() => copyText(text)}>
          <Copy className="h-3.5 w-3.5" /> Copy
        </Button>
        {canApply ? (
          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={() => onApply(text)}>
            <Send className="h-3.5 w-3.5" /> Apply to campaign
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function CopyChecker({ knownTokens }) {
  const [contentType, setContentType] = useState("email");
  const [text, setText] = useState("");
  const result = useMemo(() => checkCopy(text, { contentType, knownTokens }), [text, contentType, knownTokens]);
  return (
    <SectionCard title="Check existing copy" description="Paste any copy to run the same checks — no AI needed." contentClassName="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Copy to check" placeholder="Paste copy here…" className="min-h-28 bg-background" />
        <Field label="Content type">
          <Select value={contentType} onValueChange={setContentType}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      {text.trim() ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <ChecksList checks={result.checks} />
          <ChecksBadge checks={result.checks} />
        </div>
      ) : null}
    </SectionCard>
  );
}

export function CopyGeneratorScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const { openRecord, closeRecord, setTab } = useWorkspaceUrl();
  const status = useAiStatus(projectId);
  const history = useGenerations(projectId, "copy");
  const canUse = can("campaign.ai.use");
  const canApply = can("campaign.campaign.edit");

  const [prompt, setPrompt] = useState("");
  const [contentType, setContentType] = useState("email");
  const [tone, setTone] = useState("Friendly");
  const [length, setLength] = useState("Medium");
  const [useVoice, setUseVoice] = useState(true);
  const [voice, setVoice] = useState(null);
  const [customFields, setCustomFields] = useState([]);
  const [pending, setPending] = useState(false);
  const [unsaved, setUnsaved] = useState(null);
  const [applyText, setApplyText] = useState(null);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    Promise.all([getBrandKit(projectId), listCustomFields(projectId)]).then(([kit, fields]) => {
      if (!alive) return;
      setVoice(kit?.voice ?? "");
      setCustomFields(fields ?? []);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const knownTokens = useMemo(() => [...BASE_MERGE_TOKENS, ...customFields.map((f) => f.key)], [customFields]);
  const shown = history.active ?? unsaved;
  const shownType = shown?.output?.contentType || shown?.input?.contentType || "email";
  const ready = canUse && (status.configured || status.sample);

  const generate = async () => {
    if (!prompt.trim()) {
      toast.error("Describe what you're promoting first.");
      return;
    }
    setPending(true);
    const res = await apiPost(`/api/projects/${projectId}/ai/copy`, { prompt, contentType, tone, length, useBrandVoice: useVoice });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't generate copy.");
      return;
    }
    const { generation, ...output } = res.data;
    if (generation) {
      history.add(generation);
      setUnsaved(null);
      openRecord(generation.id);
    } else {
      setUnsaved({ id: null, tool: "copy", title: prompt, input: { prompt, contentType, tone, length }, output, createdAt: new Date().toISOString() });
      closeRecord();
      toast.warning("Copy generated, but it couldn't be saved to history.");
    }
  };

  const reuse = (g) => {
    setPrompt(g.input?.prompt || "");
    setContentType(g.input?.contentType || "email");
    setTone(g.input?.tone || "Friendly");
    setLength(g.input?.length || "Medium");
  };

  return (
    <MainScreenWrapper>
      <ScreenHeader title="Copy Generator" description="On-brand copy variants, each checked for length, spam triggers and merge tags." />

      <AiStatusNotice status={status} canUse={canUse} fallback="The copy checks below still work without it." />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <SectionCard contentClassName="space-y-4">
            <Field label="What are you promoting?" htmlFor="cg-prompt">
              <Textarea
                id="cg-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Early access to the autumn collection for loyalty members, 48 hours before everyone else."
                className="min-h-20 bg-background"
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Content type">
                <Select value={contentType} onValueChange={setContentType}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Tone">
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Length">
                <Select value={length} onValueChange={setLength}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LENGTHS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <SettingsList className="border-t border-border pt-4">
              {voice === null ? null : voice ? (
                <SettingRow
                  icon={Palette}
                  title="Write in the brand voice"
                  description={voice.length > 140 ? `${voice.slice(0, 140)}…` : voice}
                  checked={useVoice}
                  onCheckedChange={setUseVoice}
                />
              ) : (
                <SettingRow
                  icon={Palette}
                  title="No brand voice set"
                  description="Describe how the brand sounds in the Brand Kit and every generation will follow it."
                  control={
                    <Button size="sm" variant="outline" className={OUTLINE_BUTTON} onClick={() => setTab("Brand Kit")}>
                      Open Brand Kit
                    </Button>
                  }
                />
              )}
            </SettingsList>
            <Button onClick={generate} disabled={!ready || pending || !prompt.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {pending ? "Generating…" : "Generate 3 variants"}
            </Button>
          </SectionCard>

          {pending ? (
            <div className="flex min-h-60 items-center justify-center rounded-xl border border-border bg-surface-subtle">
              <LogoLoading size={48} aria-label="Generating copy" />
            </div>
          ) : shown ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  {TYPE_LABEL[shownType]} · {shown.input?.tone} · {shown.input?.length}
                </h2>
                <div className="flex items-center gap-3 text-xs text-text-tertiary">
                  <span>
                    {formatWhen(shown.createdAt)}
                    {status.sample ? " · sample output" : shown.model ? ` · ${shown.model}` : ""}
                    {shown.output?.voiceUsed ? " · brand voice" : ""}
                  </span>
                  <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={() => reuse(shown)}>
                    Reuse inputs
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                {(shown.output?.variants || []).map((v) => (
                  <VariantEditor
                    key={`${shown.id}-${v.label}`}
                    variant={v}
                    contentType={shownType}
                    knownTokens={knownTokens}
                    canApply={canApply && Boolean(APPLY_CHANNEL[shownType])}
                    onApply={setApplyText}
                  />
                ))}
              </div>
            </section>
          ) : (
            <EmptyState
              icon={Lightbulb}
              title="No copy yet"
              description="Describe what you're promoting and generate three variants — or reopen one from history."
              className="rounded-xl border border-dashed border-border bg-surface-subtle"
            />
          )}

          <CopyChecker knownTokens={knownTokens} />
        </div>

        <HistoryCard
          items={history.items}
          loading={history.loading}
          activeId={shown?.id}
          canDelete={canUse}
          onOpen={(g) => openRecord(g.id)}
          onDelete={async (g) => {
            if ((await history.remove(g)) && shown?.id === g.id) closeRecord();
          }}
          describe={(g) => TYPE_LABEL[g.input?.contentType] || "Copy"}
        />
      </div>

      <ApplyToCampaignDialog
        open={applyText !== null}
        onOpenChange={(o) => !o && setApplyText(null)}
        projectId={projectId}
        mode="body"
        channel={APPLY_CHANNEL[shownType] || "email"}
        payload={{ text: applyText || "" }}
      />
    </MainScreenWrapper>
  );
}

export default CopyGeneratorScreen;
