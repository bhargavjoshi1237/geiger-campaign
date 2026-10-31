"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AtSign,
  Briefcase,
  Camera,
  Check,
  Film,
  ImageIcon,
  Layers,
  Pin,
  Plug,
  Send,
  SquarePlay,
  ThumbsUp,
  Video,
} from "lucide-react";
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
  LoadingArea,
  SearchInput,
  cn,
} from "@geiger/ui";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listConnections } from "@/lib/supabase/channel_connections";
import { listPostTargets, listSocialPosts } from "@/lib/supabase/social_posts";
import { listAssets } from "@/lib/supabase/assets";
import { NETWORKS, networkForChannel, networkLabel } from "@/lib/social/networks";
import { OUTLINE_BUTTON } from "./constants";

// Shared pieces for the Social screens: network icons, the connected-accounts and posts hooks, the asset-library
// media picker and per-network post previews.

export const NETWORK_ICONS = {
  instagram: Camera,
  facebook: ThumbsUp,
  telegram: Send,
  tiktok: Video,
  linkedin: Briefcase,
  x: AtSign,
  threads: AtSign,
  pinterest: Pin,
  youtube: SquarePlay,
};

export function NetworkIcon({ network, className }) {
  const Icon = NETWORK_ICONS[network] || AtSign;
  return <Icon className={cn("h-4 w-4", className)} aria-hidden="true" />;
}

export function NetworkBadge({ network, label }) {
  return (
    <Badge variant="neutral">
      <NetworkIcon network={network} className="h-3 w-3" />
      {label || networkLabel(network)}
    </Badge>
  );
}

const SOCIAL_CHANNELS = ["instagram", "messenger", "telegram", "tiktok"];

export function toAccount(connection) {
  const network = networkForChannel(connection.channel);
  return {
    id: connection.id,
    network,
    channel: connection.channel,
    name: connection.name || connection.handle || networkLabel(network),
    handle: connection.handle || "",
    status: connection.status,
    connected: connection.status === "connected",
    publishable: Boolean(NETWORKS[network]?.publishable),
    config: connection.config || {},
    scopes: Array.isArray(connection.health?.scopes) && connection.health.scopes.length ? connection.health.scopes : null,
  };
}

// Social accounts connected in this project (Social Accounts screen owns connecting them).
export function useSocialAccounts(projectId) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    listConnections(projectId, { channel: SOCIAL_CHANNELS }).then((rows) => {
      if (!alive) return;
      setAccounts((rows ?? []).map(toAccount).filter((a) => a.network));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);
  return { accounts, loading };
}

// Posts with their targets attached ({ ...post, targets: [...] }).
export function useSocialPosts(projectId) {
  const [posts, setPosts] = useState([]);
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [p, t] = await Promise.all([listSocialPosts(projectId), listPostTargets(projectId)]);
    if (p === null && t === null) return false;
    setPosts(p ?? []);
    setTargets(t ?? []);
    return true;
  }, [projectId]);

  useEffect(() => {
    let alive = true;
    Promise.all([listSocialPosts(projectId), listPostTargets(projectId)]).then(([p, t]) => {
      if (!alive) return;
      setPosts(p ?? []);
      setTargets(t ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const withTargets = useMemo(() => {
    const byPost = new Map();
    for (const t of targets) {
      if (!byPost.has(t.postId)) byPost.set(t.postId, []);
      byPost.get(t.postId).push(t);
    }
    return posts.map((p) => ({ ...p, targets: byPost.get(p.id) || [] }));
  }, [posts, targets]);

  return { posts: withTargets, rawPosts: posts, setPosts, targets, setTargets, loading, reload };
}

// Current time for render-time comparisons, refreshed on an interval (render stays pure).
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function LoadingPanel({ label = "Loading", size = 48 }) {
  return <LoadingArea size={size} label={label} panel />;
}

// Empty state for "no social account connected yet" with the one action that fixes it.
export function ConnectAccountsNotice({ title = "No social accounts connected", description }) {
  const { setTab } = useWorkspaceUrl();
  return (
    <div className="rounded-xl border border-border bg-surface-subtle">
      <EmptyState
        icon={Plug}
        title={title}
        description={description || "Connect an Instagram business account, a Facebook Page or a Telegram bot in Social Accounts to publish here."}
        action={
          <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setTab("Social Accounts")}>
            Open Social Accounts
          </Button>
        }
      />
    </div>
  );
}

export function MediaThumb({ item, className }) {
  if (!item?.url) {
    return (
      <span className={cn("flex items-center justify-center rounded-md border border-border bg-surface-card text-text-tertiary", className)}>
        <ImageIcon className="h-4 w-4" />
      </span>
    );
  }
  if (item.kind === "video") {
    return (
      <span className={cn("relative block overflow-hidden rounded-md border border-border bg-surface-card", className)}>
        <video src={item.url} muted preload="metadata" className="h-full w-full object-cover" aria-label={item.altText || item.name || "Video"} />
        <span className="absolute right-1 top-1 rounded bg-background/85 p-0.5">
          <Film className="h-3 w-3 text-foreground" aria-hidden="true" />
        </span>
      </span>
    );
  }
  return (
    <span className={cn("block overflow-hidden rounded-md border border-border bg-surface-card", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.url} alt={item.altText || item.name || ""} className="h-full w-full object-cover" loading="lazy" />
    </span>
  );
}

function MediaPickerBody({ projectId, initial, max, onConfirm, onClose }) {
  const [assets, setAssets] = useState(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(() => initial.map((m) => m.assetId).filter(Boolean));

  useEffect(() => {
    let alive = true;
    listAssets(projectId, { kinds: ["image", "video"] }).then((rows) => alive && setAssets(rows ?? []));
    return () => {
      alive = false;
    };
  }, [projectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (assets || []).filter((a) => a.url && (!q || `${a.name} ${(a.tags || []).join(" ")}`.toLowerCase().includes(q)));
  }, [assets, query]);

  const toggle = (id) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= max ? p : [...p, id]));

  const confirm = () => {
    const byId = new Map((assets || []).map((a) => [a.id, a]));
    const kept = new Map(initial.filter((m) => m.assetId).map((m) => [m.assetId, m]));
    onConfirm(
      picked
        .map((id) => {
          const a = byId.get(id);
          if (!a) return kept.get(id) || null;
          return { assetId: a.id, url: a.url, kind: a.kind === "video" ? "video" : "image", altText: kept.get(id)?.altText ?? a.altText ?? "", name: a.name };
        })
        .filter(Boolean),
    );
  };

  return (
    <>
      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">
            {picked.length} of {max} selected · order follows selection
          </p>
          <SearchInput value={query} onChange={setQuery} placeholder="Search assets…" />
        </div>
        {assets === null ? (
          <LoadingArea size={40} label="Loading assets" panel />
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-subtle">
            <EmptyState
              icon={ImageIcon}
              title={query ? "No matches" : "No images or videos yet"}
              description={query ? "Try a different search." : "Upload media in Content → Asset Library, then pick it here."}
            />
          </div>
        ) : (
          <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
            {filtered.map((a) => {
              const index = picked.indexOf(a.id);
              const selected = index !== -1;
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggle(a.id)}
                  className={cn(
                    "group relative overflow-hidden rounded-lg border bg-surface-card text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    selected ? "border-primary" : "border-border hover:border-border-strong",
                  )}
                >
                  <MediaThumb item={{ url: a.url, kind: a.kind, altText: a.altText, name: a.name }} className="aspect-square w-full rounded-none border-0" />
                  <span className="block truncate px-2 py-1.5 text-xs text-text-secondary group-hover:text-foreground">{a.name}</span>
                  {selected ? (
                    <span className="absolute left-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground tabular-nums">
                      {index + 1}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={confirm} disabled={assets === null}>
          <Check className="h-4 w-4" /> Use {picked.length || "no"} item{picked.length === 1 ? "" : "s"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function MediaPickerDialog({ open, onOpenChange, projectId, value = [], max = 10, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose media</DialogTitle>
          <DialogDescription>Pick images or videos from the asset library. Platforms fetch media from its public URL.</DialogDescription>
        </DialogHeader>
        {open ? (
          <MediaPickerBody
            projectId={projectId}
            initial={value}
            max={max}
            onClose={() => onOpenChange(false)}
            onConfirm={(items) => {
              onConfirm(items);
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Avatar({ account }) {
  const initial = (account?.name || "?").trim().charAt(0).toUpperCase();
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-active text-xs font-semibold text-foreground">
      {initial}
    </span>
  );
}

function PreviewMedia({ media, format }) {
  if (!media.length) return null;
  const tall = format === "story" || format === "reel";
  return (
    <div className="relative">
      <MediaThumb item={media[0]} className={cn("w-full rounded-none border-0 border-y border-border", tall ? "aspect-[9/16] max-h-96" : "aspect-square")} />
      {media.length > 1 ? (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-medium text-foreground">
          <Layers className="h-3 w-3" /> 1/{media.length}
        </span>
      ) : null}
    </div>
  );
}

// A neutral, suite-styled approximation of how the post reads on each network.
export function PostPreview({ network, account, text, media = [], format = "feed", firstComment = "" }) {
  const name = account?.name || networkLabel(network);
  const handle = account?.handle ? `@${String(account.handle).replace(/^@/, "")}` : "";

  if (network === "telegram") {
    return (
      <div className="rounded-xl border border-border bg-surface-card p-3">
        <div className="mb-2 flex items-center gap-2">
          <Avatar account={account} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{name}</p>
            <p className="text-[11px] text-text-tertiary">Channel post</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-surface-subtle">
          <PreviewMedia media={media} format="feed" />
          <p className="whitespace-pre-wrap break-words px-3 py-2 text-sm text-foreground">{text || <span className="text-text-tertiary">Your post text</span>}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-card">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Avatar account={account} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          <p className="truncate text-[11px] text-text-tertiary">{handle || networkLabel(network)}</p>
        </div>
        <NetworkIcon network={network} className="ml-auto text-text-tertiary" />
      </div>
      {network === "facebook" ? (
        <>
          <p className="whitespace-pre-wrap break-words px-3 pb-2.5 text-sm text-foreground">{text || <span className="text-text-tertiary">Your post text</span>}</p>
          <PreviewMedia media={media} format={format} />
        </>
      ) : (
        <>
          <PreviewMedia media={media} format={format} />
          {format === "story" ? (
            <p className="px-3 py-2.5 text-xs text-text-tertiary">Stories publish the media only.</p>
          ) : (
            <p className="whitespace-pre-wrap break-words px-3 py-2.5 text-sm text-foreground">
              {handle ? <span className="mr-1 font-medium">{handle.slice(1)}</span> : null}
              {text || <span className="text-text-tertiary">Your caption</span>}
            </p>
          )}
        </>
      )}
      {firstComment && format !== "story" ? (
        <div className="border-t border-border px-3 py-2 text-xs text-text-secondary">
          <span className="font-medium text-foreground">First comment · </span>
          <span className="whitespace-pre-wrap break-words">{firstComment}</span>
        </div>
      ) : null}
    </div>
  );
}
