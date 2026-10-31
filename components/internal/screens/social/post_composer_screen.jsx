"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  CircleAlert,
  Clock3,
  FileText,
  Hash,
  ImagePlus,
  Loader2,
  Plus,
  Send,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  Input,
  ScreenHeader,
  SectionCard,
  SegmentedTabs,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusPill,
  Switch,
  Textarea,
  cn,
} from "@geiger/ui";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { apiPost } from "@/lib/api/client";
import { getUser } from "@/lib/supabase/user";
import { listMembers } from "@/lib/supabase/rbac";
import {
  createSocialPost,
  getSocialPost,
  listPostTargets,
  savePostTargets,
  updateSocialPost,
  updateSocialPostMeta,
} from "@/lib/supabase/social_posts";
import { createHashtagSet, listHashtagSets, softDeleteHashtagSet } from "@/lib/supabase/hashtag_sets";
import {
  FORMAT_LABELS,
  NETWORKS,
  NETWORK_ORDER,
  allowedFormats,
  charCount,
  composeCaption,
  composeFirstComment,
  defaultFormat,
  hasBlockingIssues,
  networkLabel,
  normalizeTag,
  validateTarget,
} from "@/lib/social/networks";
import { bestTimes } from "@/lib/social/best_time";
import {
  ConnectAccountsNotice,
  LoadingPanel,
  MediaPickerDialog,
  MediaThumb,
  NETWORK_ICONS,
  NetworkIcon,
  PostPreview,
  useSocialAccounts,
} from "./social_kit";
import {
  OUTLINE_BUTTON,
  POST_STATUS_MAP,
  TARGET_STATUS_MAP,
  formatDateTime,
  formatPercent,
  formatRelative,
  fromLocalInput,
  toLocalInput,
} from "./constants";

const LOCKED = new Set(["published", "publishing"]);
// Meta permission each network's content publishing needs.
const PUBLISH_SCOPES = { instagram: "instagram_content_publish", facebook: "pages_manage_posts" };
const PRE_APPROVAL = new Set(["draft", "in_review"]);

const emptyDraft = () => ({
  id: crypto.randomUUID(),
  title: "",
  body: "",
  media: [],
  firstComment: "",
  hashtagSetId: null,
  hashtagPlacement: "caption",
  scheduledAt: null,
  targets: {},
});

function draftFrom(post, targets) {
  return {
    id: post.id,
    title: post.title,
    body: post.body,
    media: post.media,
    firstComment: post.firstComment,
    hashtagSetId: post.hashtagSetId,
    hashtagPlacement: post.hashtagPlacement,
    scheduledAt: post.scheduledAt,
    targets: Object.fromEntries(
      targets
        .filter((t) => t.connectionId && t.status !== "cancelled")
        .map((t) => [t.connectionId, { connectionId: t.connectionId, network: t.network, format: t.format, variantText: t.variantText, chatId: t.chatId || "" }]),
    ),
  };
}

// Content fields whose change on an approved post needs a fresh sign-off.
const contentKey = (d) => JSON.stringify([d.body, d.media, d.firstComment, d.hashtagSetId, d.hashtagPlacement, d.targets]);

function HashtagSetsDialog({ open, onOpenChange, sets, onCreate, onDelete, onPick, canEdit }) {
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const parsed = tags.split(/[\s,]+/).map(normalizeTag).filter(Boolean);

  const submit = async () => {
    if (!name.trim() || !parsed.length) return;
    setSaving(true);
    const ok = await onCreate({ name: name.trim(), tags: parsed });
    setSaving(false);
    if (ok) {
      setName("");
      setTags("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Hashtag sets</DialogTitle>
          <DialogDescription>Reusable groups of hashtags you can add to a caption or the first comment.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {sets.length ? (
            <ul className="max-h-60 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface-card">
              {sets.map((s) => (
                <li key={s.id} className="flex items-start gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{s.name}</p>
                    <p className="truncate text-xs text-text-secondary">{s.tags.map((t) => `#${t}`).join(" ")}</p>
                  </div>
                  <Button size="sm" variant="outline" className={OUTLINE_BUTTON} onClick={() => onPick(s.id)}>
                    Use
                  </Button>
                  {canEdit ? (
                    <Button size="icon-sm" variant="ghost" aria-label={`Delete ${s.name}`} className="text-red-600 hover:bg-red-500/10 dark:text-red-400" onClick={() => onDelete(s)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-border bg-surface-card px-3 py-3 text-sm text-text-secondary">No sets yet.</p>
          )}
          {canEdit ? (
            <div className="grid gap-3 rounded-lg border border-border bg-surface-card p-3">
              <Field label="Set name" htmlFor="hs-name">
                <Input id="hs-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Product launches" />
              </Field>
              <Field label="Hashtags" htmlFor="hs-tags" hint={parsed.length ? `${parsed.length} tag${parsed.length === 1 ? "" : "s"}: ${parsed.join(" ")}` : "Separate with spaces or commas."}>
                <Textarea id="hs-tags" rows={2} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="#halcyon #brandstudio #design" />
              </Field>
              <div className="flex justify-end">
                <Button onClick={submit} disabled={saving || !name.trim() || !parsed.length}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add set
                </Button>
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ open, onOpenChange, onReject, busy }) {
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request changes</DialogTitle>
          <DialogDescription>The post goes back to draft with your note for the author.</DialogDescription>
        </DialogHeader>
        <Field label="What needs to change" htmlFor="reject-note">
          <Textarea id="reject-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Swap the second image and shorten the caption." />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onReject(note.trim())} disabled={busy || !note.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Send back
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IssueList({ issues }) {
  if (!issues.length) {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
        <Check className="h-3.5 w-3.5" /> Ready to publish
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {issues.map((issue, i) => (
        <li key={i} className={cn("flex items-start gap-1.5 text-xs", issue.level === "error" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400")}>
          {issue.level === "error" ? <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}

const HISTORY_LABELS = { submitted: "Submitted for review", approved: "Approved", rejected: "Changes requested", scheduled: "Scheduled", unscheduled: "Unscheduled" };

function PostComposer({ projectId, recordId, onCreated, onNew }) {
  const { can } = useRbac();
  const { setTab } = useWorkspaceUrl();
  const canEdit = can("campaign.social.edit");
  const canPublish = can("campaign.social.publish");
  const canApprove = can("campaign.approval.decide");

  const { accounts, loading: accountsLoading } = useSocialAccounts(projectId);
  const [post, setPost] = useState(null);
  const [savedTargets, setSavedTargets] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [baseline, setBaseline] = useState(null);
  const [loading, setLoading] = useState(Boolean(recordId));
  const [missing, setMissing] = useState(false);
  const [sets, setSets] = useState([]);
  const [history, setHistory] = useState([]);
  const [members, setMembers] = useState([]);
  const [userId, setUserId] = useState(null);
  const [mode, setMode] = useState("now");
  const [activeTab, setActiveTab] = useState("all");
  const [previewTab, setPreviewTab] = useState(null);
  const [busy, setBusy] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [setsOpen, setSetsOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const loads = [
      listHashtagSets(projectId),
      listPostTargets(projectId, { status: "published" }),
      listMembers(projectId),
      getUser(),
      recordId ? getSocialPost(projectId, recordId) : Promise.resolve(null),
      recordId ? listPostTargets(projectId, { postIds: [recordId] }) : Promise.resolve([]),
    ];
    Promise.all(loads).then(([hs, published, team, user, existing, targets]) => {
      if (!alive) return;
      setSets(hs ?? []);
      setHistory(published ?? []);
      setMembers(team ?? []);
      setUserId(user?.id || null);
      if (recordId) {
        if (!existing) setMissing(true);
        else {
          const next = draftFrom(existing, targets ?? []);
          setPost(existing);
          setSavedTargets(targets ?? []);
          setDraft(next);
          setBaseline(contentKey(next));
          setMode(existing.scheduledAt ? "schedule" : "now");
        }
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, recordId]);

  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const status = post?.status || "draft";
  const locked = LOCKED.has(status);
  const readOnly = locked || !canEdit;
  const hashtagSet = useMemo(() => sets.find((s) => s.id === draft.hashtagSetId) || null, [sets, draft.hashtagSetId]);
  const tags = useMemo(() => hashtagSet?.tags || [], [hashtagSet]);
  const memberName = (id) => (id && id === userId ? "You" : members.find((m) => m.userId === id)?.name || "A teammate");

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const publishable = accounts.filter((a) => a.publishable);
  const unavailable = accounts.filter((a) => !a.publishable);
  const missingNetworks = NETWORK_ORDER.filter((n) => NETWORKS[n].publishable && !accounts.some((a) => a.network === n));
  const otherNetworks = NETWORK_ORDER.filter((n) => !NETWORKS[n].publishable && !accounts.some((a) => a.network === n));

  // Selected targets with their effective format and composed copy.
  const selected = useMemo(
    () =>
      Object.values(draft.targets)
        .map((t) => {
          const account = accountById.get(t.connectionId);
          if (!account) return null;
          const formats = allowedFormats(t.network, draft.media);
          const format = formats.includes(t.format) ? t.format : defaultFormat(t.network, draft.media);
          const text = composeCaption(t.variantText ?? draft.body, tags, draft.hashtagPlacement);
          const firstComment = NETWORKS[t.network]?.firstComment ? composeFirstComment(draft.firstComment, tags, draft.hashtagPlacement) : "";
          const issues = validateTarget({ network: t.network, format, text, media: draft.media, firstComment: composeFirstComment(draft.firstComment, tags, draft.hashtagPlacement) });
          if (t.network === "telegram" && !t.chatId && !account.config?.channelUsername && !account.config?.channelChatId && !account.config?.channelId && !account.config?.chatId) {
            issues.unshift({ level: "error", message: "Set the Telegram channel this bot posts to." });
          }
          const scope = PUBLISH_SCOPES[t.network];
          if (scope && account.scopes && !account.scopes.includes(scope)) {
            issues.unshift({ level: "error", message: `${account.name} didn't grant ${scope} — reconnect it in Social Accounts and allow publishing.` });
          }
          if (!account.connected) issues.unshift({ level: "error", message: `${account.name} is ${account.status} — reconnect it in Social Accounts.` });
          return { ...t, account, format, formats, text, firstComment, issues };
        })
        .filter(Boolean),
    [draft, accountById, tags],
  );
  const blocking = selected.some((t) => hasBlockingIssues(t.issues));
  const contentChanged = baseline !== null && baseline !== contentKey(draft);
  const savedTargetById = new Map(savedTargets.map((t) => [t.connectionId, t]));

  const suggestions = useMemo(() => {
    const network = selected[0]?.network || null;
    return { network, ...bestTimes(history, { network }) };
  }, [history, selected]);

  const toggleAccount = (account) => {
    if (readOnly) return;
    setDraft((d) => {
      const targets = { ...d.targets };
      if (targets[account.id]) delete targets[account.id];
      else targets[account.id] = { connectionId: account.id, network: account.network, format: defaultFormat(account.network, d.media), variantText: null, chatId: "" };
      return { ...d, targets };
    });
  };

  const patchTarget = (connectionId, patch) =>
    setDraft((d) => ({ ...d, targets: { ...d.targets, [connectionId]: { ...d.targets[connectionId], ...patch } } }));

  const moveMedia = (index, delta) =>
    setDraft((d) => {
      const media = [...d.media];
      const to = index + delta;
      if (to < 0 || to >= media.length) return d;
      [media[index], media[to]] = [media[to], media[index]];
      return { ...d, media };
    });

  // Writes content, then targets, then the status change — so the worker never sees a due post without its targets.
  const persist = async (statusPatch = null, label = "save") => {
    setBusy(label);
    const content = {
      title: draft.title.trim(),
      body: draft.body,
      media: draft.media,
      firstComment: draft.firstComment,
      hashtagSetId: draft.hashtagSetId,
    };
    let saved;
    if (!post) {
      saved = await createSocialPost(projectId, { id: draft.id, ...content, status: "draft", scheduledAt: draft.scheduledAt, createdBy: userId, metadata: { hashtagPlacement: draft.hashtagPlacement } });
    } else {
      const keepStatus = contentChanged && (status === "approved" || status === "scheduled") && !canApprove ? { status: "draft" } : {};
      saved = await updateSocialPost(post.id, { ...content, ...keepStatus, ...(status === "scheduled" && !canPublish ? {} : { scheduledAt: draft.scheduledAt }) });
      if (saved) await updateSocialPostMeta(post.id, { hashtagPlacement: draft.hashtagPlacement });
      if (keepStatus.status) toast.message("Edits to an approved post need a new approval — it's back in draft.");
    }
    if (!saved) {
      setBusy(null);
      toast.error("Couldn't save the post.");
      return null;
    }
    const targetList = selected.map((t) => ({
      connectionId: t.connectionId,
      network: t.network,
      format: t.format,
      variantText: t.variantText,
      ...(t.network === "telegram" ? { metadata: { chatId: t.chatId || null } } : {}),
    }));
    const targets = await savePostTargets(projectId, saved.id, targetList);
    if (targets === null) {
      setBusy(null);
      toast.error("Saved the post, but couldn't save its accounts.");
      return null;
    }
    let final = saved;
    if (statusPatch) {
      final = await updateSocialPost(saved.id, statusPatch);
      if (!final) {
        setBusy(null);
        toast.error("Couldn't update the post status — check your role allows it.");
        setPost(saved);
        return null;
      }
    }
    const nextDraft = { ...draft, id: final.id };
    setPost({ ...final, hashtagPlacement: draft.hashtagPlacement });
    setSavedTargets(targets);
    setBaseline(contentKey(nextDraft));
    setBusy(null);
    if (!post) onCreated(final.id);
    return final;
  };

  const historyWith = (entry, extra = {}) => {
    const approval = post?.approval || { history: [] };
    return { ...approval, ...extra, history: [...(approval.history || []), { ...entry, by: userId, at: new Date().toISOString() }] };
  };

  const save = async () => {
    const res = await persist(null, "save");
    if (res) toast.success(post ? "Post saved." : "Draft saved.");
  };

  const submitForReview = async () => {
    const res = await persist(
      { status: "in_review", approval: historyWith({ action: "submitted" }, { requestedAt: new Date().toISOString(), requestedBy: userId, decision: null, note: "" }) },
      "submit",
    );
    if (res) toast.success("Sent for review.");
  };

  const approve = async () => {
    const res = await persist({ status: "approved", approval: historyWith({ action: "approved" }, { decision: "approved", decidedAt: new Date().toISOString(), decidedBy: userId }) }, "approve");
    if (res) toast.success("Post approved.");
  };

  const reject = async (note) => {
    const res = await persist({ status: "draft", approval: historyWith({ action: "rejected", note }, { decision: "rejected", decidedAt: new Date().toISOString(), decidedBy: userId, note }) }, "reject");
    if (res) {
      setRejectOpen(false);
      toast.success("Sent back to the author.");
    }
  };

  const ensureReady = () => {
    if (!selected.length) {
      toast.error("Pick at least one account.");
      return false;
    }
    if (blocking) {
      toast.error("Fix the issues flagged in the preview first.");
      return false;
    }
    return true;
  };

  const schedule = async () => {
    if (!ensureReady()) return;
    if (!draft.scheduledAt || new Date(draft.scheduledAt).getTime() < Date.now() + 60_000) {
      toast.error("Pick a time at least a minute from now.");
      return;
    }
    const selfApprove = PRE_APPROVAL.has(status);
    const res = await persist(
      {
        status: "scheduled",
        scheduledAt: draft.scheduledAt,
        approval: selfApprove
          ? historyWith({ action: "approved", note: "Approved on schedule" }, { decision: "approved", decidedAt: new Date().toISOString(), decidedBy: userId })
          : historyWith({ action: "scheduled" }),
      },
      "schedule",
    );
    if (res) toast.success(`Scheduled for ${formatDateTime(draft.scheduledAt)}.`);
  };

  const unschedule = async () => {
    const res = await persist({ status: "approved", approval: historyWith({ action: "unscheduled" }) }, "unschedule");
    if (res) toast.success("Taken off the schedule.");
  };

  const publishNow = async () => {
    if (!ensureReady()) return;
    const saved = await persist(null, "publish");
    if (!saved) return;
    setBusy("publish");
    const res = await apiPost(`/api/projects/${projectId}/social/publishing/posts/${saved.id}/publish`, {});
    const [fresh, targets] = await Promise.all([getSocialPost(projectId, saved.id), listPostTargets(projectId, { postIds: [saved.id] })]);
    if (fresh) setPost(fresh);
    if (targets) setSavedTargets(targets);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error || "Couldn't publish the post.");
      return;
    }
    const results = res.data?.results || [];
    const failed = results.filter((r) => r.status === "failed");
    const pending = results.filter((r) => r.status === "publishing");
    if (failed.length) toast.error(`${failed.length} of ${results.length} account${results.length === 1 ? "" : "s"} failed: ${failed[0].error}`);
    else if (pending.length) toast.success("Publishing — Instagram is still processing the video. It finishes in the background.");
    else toast.success("Published.");
  };

  const createSet = async (input) => {
    const created = await createHashtagSet(projectId, { id: crypto.randomUUID(), ...input, createdBy: userId });
    if (!created) {
      toast.error("Couldn't save the hashtag set.");
      return false;
    }
    setSets((s) => [...s, created]);
    toast.success(`Saved "${created.name}".`);
    return true;
  };

  const deleteSet = async (s) => {
    setSets((list) => list.filter((x) => x.id !== s.id));
    if (draft.hashtagSetId === s.id) set("hashtagSetId")(null);
    const ok = await softDeleteHashtagSet(s.id);
    if (!ok) {
      setSets((list) => [...list, s]);
      toast.error("Couldn't delete the set.");
    }
  };

  if (loading || accountsLoading) {
    return (
      <MainScreenWrapper>
        <LoadingPanel label="Loading composer" size={56} />
      </MainScreenWrapper>
    );
  }

  if (missing) {
    return (
      <MainScreenWrapper>
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={FileText}
            title="Post not found"
            description="It may have been deleted. Start a new post instead."
            action={<Button onClick={onNew}><Plus className="h-4 w-4" /> New post</Button>}
          />
        </div>
      </MainScreenWrapper>
    );
  }

  const tabTargets = selected;
  const activeTarget = tabTargets.find((t) => t.connectionId === activeTab) || null;
  const previewTarget = tabTargets.find((t) => t.connectionId === previewTab) || tabTargets[0] || null;
  const uniqueNetworks = [...new Set(selected.map((t) => t.network))];
  const maxMedia = Math.min(10, ...selected.map((t) => NETWORKS[t.network]?.maxMedia || 10));
  const approvalHistory = post?.approval?.history || [];
  const canSchedule = canPublish && (canApprove || !PRE_APPROVAL.has(status));

  const primaryAction = (() => {
    if (locked) return null;
    if (status === "scheduled") {
      return canPublish ? (
        <Button variant="outline" className={OUTLINE_BUTTON} onClick={unschedule} disabled={Boolean(busy)}>
          {busy === "unschedule" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Unschedule
        </Button>
      ) : null;
    }
    if (canSchedule && mode === "schedule") {
      return (
        <Button onClick={schedule} disabled={Boolean(busy) || !canEdit}>
          {busy === "schedule" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />} Schedule
        </Button>
      );
    }
    if (canSchedule && mode === "now") {
      return (
        <Button onClick={publishNow} disabled={Boolean(busy) || !canEdit}>
          {busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publish now
        </Button>
      );
    }
    if (status === "draft" && canEdit) {
      return (
        <Button onClick={submitForReview} disabled={Boolean(busy)}>
          {busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit for review
        </Button>
      );
    }
    return null;
  })();

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title={post ? draft.title || "Untitled post" : "Post composer"}
        description={post ? `Created ${formatRelative(post.createdAt)} · ${POST_STATUS_MAP[status]?.label || status}` : "Write once, tailor per network, then schedule or publish to your connected accounts."}
        actions={
          <>
            {post ? <StatusPill status={status} map={POST_STATUS_MAP} /> : null}
            {post ? (
              <Button variant="ghost" onClick={onNew} className="text-muted-foreground">
                <Plus className="h-4 w-4" /> New post
              </Button>
            ) : null}
            {status === "in_review" && canApprove && !locked ? (
              <>
                <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setRejectOpen(true)} disabled={Boolean(busy)}>
                  Request changes
                </Button>
                <Button variant="outline" className={OUTLINE_BUTTON} onClick={approve} disabled={Boolean(busy)}>
                  {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
                </Button>
              </>
            ) : null}
            {!readOnly ? (
              <Button variant="outline" className={OUTLINE_BUTTON} onClick={save} disabled={Boolean(busy) || (post && !contentChanged && draft.title === post.title && draft.scheduledAt === post.scheduledAt)}>
                {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {post ? "Save" : "Save draft"}
              </Button>
            ) : null}
            {primaryAction}
          </>
        }
      />

      {locked ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-subtle px-4 py-3">
          <p className="text-sm text-text-secondary">
            {status === "published" ? "This post is published. Track per-account results and metrics in Publishing." : "This post is publishing now."}
          </p>
          <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => setTab("Publishing")}>
            Open Publishing
          </Button>
        </div>
      ) : null}

      {post?.approval?.decision === "rejected" && status === "draft" && post.approval.note ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-medium">Changes requested by {memberName(post.approval.decidedBy)}:</span> {post.approval.note}
          </span>
        </div>
      ) : null}

      {!publishable.length ? <ConnectAccountsNotice description="Connect an Instagram business account, a Facebook Page or a Telegram bot in Social Accounts — the composer publishes only to connected accounts." /> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <SectionCard title="Accounts" description="Posts go only to accounts connected in Social Accounts.">
            <div className="flex flex-wrap gap-2">
              {publishable.map((a) => {
                const on = Boolean(draft.targets[a.id]);
                const saved = savedTargetById.get(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={on}
                    disabled={readOnly || !a.connected}
                    onClick={() => toggleAccount(a)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60",
                      on ? "border-primary bg-surface-active text-foreground" : "border-border bg-surface-card text-muted-foreground hover:bg-surface-hover",
                    )}
                  >
                    <NetworkIcon network={a.network} />
                    <span className="flex flex-col leading-tight">
                      <span className="font-medium text-foreground">{a.name}</span>
                      <span className="text-[11px] text-text-tertiary">{a.connected ? networkLabel(a.network) : `${networkLabel(a.network)} · ${a.status}`}</span>
                    </span>
                    {saved && saved.status !== "pending" ? <StatusPill status={saved.status} map={TARGET_STATUS_MAP} className="ml-1" /> : null}
                    {on ? <Check className="h-4 w-4 text-foreground" /> : null}
                  </button>
                );
              })}
              {missingNetworks.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTab("Social Accounts")}
                  className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-text-tertiary transition-colors hover:text-foreground"
                >
                  <NetworkIcon network={n} />
                  {networkLabel(n)} · not connected
                </button>
              ))}
            </div>
            {unavailable.length || otherNetworks.length ? (
              <p className="mt-3 text-xs text-text-tertiary">
                {[...unavailable.map((a) => `${a.name} (${networkLabel(a.network)})`), ...otherNetworks.map(networkLabel)].join(", ")} — publishing isn&apos;t available for {unavailable.length + otherNetworks.length === 1 ? "this network" : "these networks"} yet.
              </p>
            ) : null}
          </SectionCard>

          <SectionCard title="Content">
            <div className="grid gap-4">
              <Field label="Internal name" htmlFor="pc-title" hint="Only your team sees this.">
                <Input id="pc-title" value={draft.title} onChange={(e) => set("title")(e.target.value)} placeholder="e.g. Atlas Coffee launch teaser" disabled={readOnly} />
              </Field>

              {tabTargets.length ? (
                <SegmentedTabs
                  value={activeTarget ? activeTarget.connectionId : "all"}
                  onChange={setActiveTab}
                  tabs={[{ label: "All networks", value: "all" }, ...tabTargets.map((t) => ({ label: t.account.name, value: t.connectionId, icon: NETWORK_ICONS[t.network] }))]}
                />
              ) : null}

              {!activeTarget ? (
                <Field label="Text" htmlFor="pc-body">
                  <Textarea id="pc-body" rows={7} value={draft.body} onChange={(e) => set("body")(e.target.value)} placeholder="What do you want to say?" disabled={readOnly} />
                </Field>
              ) : (
                <div className="grid gap-3 rounded-lg border border-border bg-surface-card p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Custom text for {activeTarget.account.name}</p>
                      <p className="text-xs text-text-secondary">Off uses the shared text.</p>
                    </div>
                    <Switch
                      checked={activeTarget.variantText !== null && activeTarget.variantText !== undefined}
                      disabled={readOnly}
                      onCheckedChange={(on) => patchTarget(activeTarget.connectionId, { variantText: on ? draft.body : null })}
                      aria-label="Customize text"
                    />
                  </div>
                  {activeTarget.variantText !== null && activeTarget.variantText !== undefined ? (
                    <Textarea rows={6} value={activeTarget.variantText} onChange={(e) => patchTarget(activeTarget.connectionId, { variantText: e.target.value })} disabled={readOnly} aria-label={`Text for ${activeTarget.account.name}`} />
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Format">
                      <Select value={activeTarget.format} onValueChange={(v) => patchTarget(activeTarget.connectionId, { format: v })} disabled={readOnly || activeTarget.formats.length < 2}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {activeTarget.formats.map((f) => <SelectItem key={f} value={f}>{FORMAT_LABELS[f]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                    {activeTarget.network === "telegram" ? (
                      <Field label="Channel" htmlFor="pc-chat" hint="Username (@channel) or chat id the bot is an admin of.">
                        <Input
                          id="pc-chat"
                          value={activeTarget.chatId || ""}
                          onChange={(e) => patchTarget(activeTarget.connectionId, { chatId: e.target.value.trim() })}
                          placeholder={activeTarget.account.config?.channelUsername || "@yourchannel"}
                          disabled={readOnly}
                        />
                      </Field>
                    ) : null}
                  </div>
                </div>
              )}

              {uniqueNetworks.length ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {selected.map((t) => {
                    const limit = t.network === "telegram" && draft.media.length ? NETWORKS.telegram.captionLimit : NETWORKS[t.network].charLimit;
                    const count = charCount(t.text);
                    return (
                      <span key={t.connectionId} className={cn("inline-flex items-center gap-1 text-xs tabular-nums", count > limit ? "text-red-600 dark:text-red-400" : "text-text-secondary")}>
                        <NetworkIcon network={t.network} className="h-3 w-3" /> {count.toLocaleString("en-US")} / {limit.toLocaleString("en-US")}
                      </span>
                    );
                  })}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-end">
                <Field label="Hashtag set">
                  <Select value={draft.hashtagSetId || "none"} onValueChange={(v) => set("hashtagSetId")(v === "none" ? null : v)} disabled={readOnly}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No hashtag set</SelectItem>
                      {sets.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.tags.length}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Place in">
                  <Select value={draft.hashtagPlacement} onValueChange={set("hashtagPlacement")} disabled={readOnly || !draft.hashtagSetId}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="caption">Caption</SelectItem>
                      <SelectItem value="first_comment">First comment</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setSetsOpen(true)}>
                  <Hash className="h-4 w-4" /> Manage sets
                </Button>
              </div>
              {hashtagSet ? <p className="-mt-2 text-xs text-text-secondary">{hashtagSet.tags.map((t) => `#${t}`).join(" ")}</p> : null}
            </div>
          </SectionCard>

          <SectionCard
            title="Media"
            description={`From the asset library · up to ${maxMedia} items. Alt text is sent to Instagram and Facebook.`}
            action={
              !readOnly ? (
                <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => setPickerOpen(true)}>
                  <ImagePlus className="h-4 w-4" /> {draft.media.length ? "Change" : "Add media"}
                </Button>
              ) : null
            }
          >
            {draft.media.length ? (
              <ul className="divide-y divide-border">
                {draft.media.map((m, i) => (
                  <li key={`${m.assetId || m.url}-${i}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <MediaThumb item={m} className="h-14 w-14 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{m.name || (m.kind === "video" ? "Video" : "Image")}</p>
                      {m.kind === "image" ? (
                        <Input
                          className="mt-1 h-8"
                          value={m.altText}
                          onChange={(e) => set("media")(draft.media.map((x, j) => (j === i ? { ...x, altText: e.target.value } : x)))}
                          placeholder="Alt text — describe the image"
                          aria-label={`Alt text for item ${i + 1}`}
                          disabled={readOnly}
                        />
                      ) : (
                        <p className="text-xs text-text-tertiary">Video</p>
                      )}
                    </div>
                    {!readOnly ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => moveMedia(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                        <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === draft.media.length - 1} onClick={() => moveMedia(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                        <Button size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => set("media")(draft.media.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-secondary">No media. Instagram needs at least one image or video; Facebook and Telegram can post text only.</p>
            )}
          </SectionCard>

          <SectionCard title="First comment" description="Posted right after publishing on Instagram and Facebook. Telegram skips it.">
            <Textarea rows={3} value={draft.firstComment} onChange={(e) => set("firstComment")(e.target.value)} placeholder="Optional — links, credits or extra hashtags" disabled={readOnly} aria-label="First comment" />
          </SectionCard>

          {!locked ? (
            <SectionCard title="When">
              <div className="grid gap-4">
                <SegmentedTabs
                  value={mode}
                  onChange={setMode}
                  tabs={[
                    { label: "Publish now", value: "now", icon: Send },
                    { label: "Schedule", value: "schedule", icon: CalendarClock },
                  ]}
                />
                {mode === "schedule" ? (
                  <>
                    <Field label="Publish at" htmlFor="pc-when" hint={draft.scheduledAt ? `${formatDateTime(draft.scheduledAt)} · ${formatRelative(draft.scheduledAt)}` : "Your local time."}>
                      <Input
                        id="pc-when"
                        type="datetime-local"
                        value={toLocalInput(draft.scheduledAt)}
                        onChange={(e) => set("scheduledAt")(fromLocalInput(e.target.value))}
                        disabled={readOnly || (status === "scheduled" && !canPublish)}
                        className="max-w-xs"
                      />
                    </Field>
                    <div>
                      <p className="mb-2 text-sm font-medium text-muted-foreground">
                        Best times{suggestions.network ? ` for ${networkLabel(suggestions.network)}` : ""}
                      </p>
                      {suggestions.enough ? (
                        <div className="flex flex-wrap gap-2">
                          {suggestions.slots.map((s) => (
                            <button
                              key={`${s.weekday}-${s.hour}`}
                              type="button"
                              disabled={readOnly}
                              onClick={() => set("scheduledAt")(s.nextAt)}
                              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-card px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-surface-hover"
                            >
                              <Clock3 className="h-3.5 w-3.5 text-text-tertiary" />
                              <span className="font-medium">{s.label}</span>
                              <span className="text-text-secondary tabular-nums">
                                {s.avgRate != null ? `${formatPercent(s.avgRate)} eng. rate` : `${Math.round(s.avgEngagement)} avg eng.`} · {s.posts} post{s.posts === 1 ? "" : "s"}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-text-secondary">
                          Suggestions come from your own published posts&apos; insights. {suggestions.sample} of {suggestions.needed} posts with metrics so far.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-text-secondary">Publishes to every selected account as soon as you confirm.</p>
                )}
                {!canPublish ? (
                  <p className="text-xs text-text-secondary">Your role can draft posts and send them for review; publishing needs the publish permission.</p>
                ) : !canApprove && PRE_APPROVAL.has(status) ? (
                  <p className="text-xs text-text-secondary">Submit the post for review — it can be scheduled once approved.</p>
                ) : null}
              </div>
            </SectionCard>
          ) : null}

          {approvalHistory.length ? (
            <SectionCard title="Approval history">
              <ol className="space-y-2.5">
                {approvalHistory.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-text-tertiary" />
                    <span className="text-foreground">
                      {HISTORY_LABELS[h.action] || h.action} <span className="text-text-secondary">by {memberName(h.by)} · {formatDateTime(h.at)}</span>
                      {h.note ? <span className="block text-xs text-text-secondary">{h.note}</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            </SectionCard>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <SectionCard title="Preview" bodyPadding>
            {previewTarget ? (
              <div className="space-y-4">
                {tabTargets.length > 1 ? (
                  <Select value={previewTarget.connectionId} onValueChange={setPreviewTab}>
                    <SelectTrigger className="w-full" aria-label="Preview account"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {tabTargets.map((t) => (
                        <SelectItem key={t.connectionId} value={t.connectionId}>
                          {t.account.name} · {networkLabel(t.network)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="neutral">{FORMAT_LABELS[previewTarget.format]}</Badge>
                  {previewTarget.variantText !== null && previewTarget.variantText !== undefined ? <Badge variant="info">Custom text</Badge> : null}
                </div>
                <PostPreview network={previewTarget.network} account={previewTarget.account} text={previewTarget.text} media={draft.media} format={previewTarget.format} firstComment={previewTarget.firstComment} />
                <IssueList issues={previewTarget.issues} />
                {savedTargetById.get(previewTarget.connectionId)?.error ? (
                  <p className="text-xs text-red-600 dark:text-red-400">Last attempt: {savedTargetById.get(previewTarget.connectionId).error}</p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-text-secondary">Pick an account to see how the post will look.</p>
            )}
          </SectionCard>
          {selected.length > 1 ? (
            <SectionCard title="Checks">
              <ul className="space-y-3">
                {selected.map((t) => (
                  <li key={t.connectionId} className="space-y-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <NetworkIcon network={t.network} className="h-3.5 w-3.5" /> {t.account.name}
                    </p>
                    <IssueList issues={t.issues} />
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </aside>
      </div>

      <MediaPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} projectId={projectId} value={draft.media} max={maxMedia} onConfirm={set("media")} />
      <HashtagSetsDialog
        open={setsOpen}
        onOpenChange={setSetsOpen}
        sets={sets}
        canEdit={canEdit}
        onCreate={createSet}
        onDelete={deleteSet}
        onPick={(id) => {
          set("hashtagSetId")(id);
          setSetsOpen(false);
        }}
      />
      <RejectDialog open={rejectOpen} onOpenChange={setRejectOpen} onReject={reject} busy={busy === "reject"} />
    </MainScreenWrapper>
  );
}

// The open post lives in the URL (?record=<id>); a newly saved draft adopts its id without remounting.
export function PostComposerScreen() {
  const { projectId } = useProject();
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const current = recordId || null;
  const [session, setSession] = useState({ key: 0, id: current, adopt: null });

  if (current !== session.id) {
    if (session.adopt && current === session.adopt) setSession({ key: session.key, id: current, adopt: null });
    else if (!(session.adopt && current === null)) setSession({ key: session.key + 1, id: current, adopt: null });
  }

  return (
    <PostComposer
      key={session.key}
      projectId={projectId}
      recordId={session.id}
      onCreated={(id) => {
        setSession((s) => ({ ...s, adopt: id }));
        openRecord(id);
      }}
      onNew={() => {
        if (current) closeRecord();
        else setSession((s) => ({ key: s.key + 1, id: null, adopt: null }));
      }}
    />
  );
}

export default PostComposerScreen;
