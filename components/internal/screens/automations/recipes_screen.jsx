"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Sparkles, FileText, ListOrdered, Eye, Loader2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { getUser } from "@/lib/supabase/user";
import { createAutomation, listAutomations } from "@/lib/supabase/automations";
import { RECIPES, RECIPE_CATEGORIES } from "@/lib/automations/recipes";
import { channelsUsed, outlineGraph, stepCount } from "@/lib/automations/graph";
import { summarizeNode } from "@/lib/automations/steps";
import { describeTrigger } from "@/lib/automations/triggers";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  cn,
  ScreenHeader,
  SearchInput,
  SegmentedTabs,
  Field,
  Toolbar,
  SectionCard,
  EmptyState,
  Badge,
  ActionMenu,
  StatsBar,
} from "@geiger/ui";
import { NodeIcon, nodeTitle } from "./canvas/automation_nodes";
import { ACCENT_CLASS, CHANNEL_META, KIND_COPY, NODE_META, OUTLINE_BUTTON, RECIPE_ICONS, formatNumber } from "./constants";

// Each recipe built once: the graph, step count and channels never change for a catalog entry.
const RECIPE_ROWS = RECIPES.map((r) => {
  const built = r.build();
  return { ...r, built, steps: stepCount(built.graph), channels: channelsUsed(built.graph) };
});

const RECIPE_NAV = [
  { key: "overview", label: "Overview", icon: FileText, desc: "What this recipe does and who it's for." },
  { key: "steps", label: "Steps", icon: ListOrdered, desc: "The automation this recipe builds, in order." },
];

const CATEGORY_OPTIONS = [{ value: "All", label: "All categories" }, ...RECIPE_CATEGORIES.map((c) => ({ value: c, label: c }))];

const KIND_TABS = [
  { value: "workflow", label: "Workflow" },
  { value: "journey", label: "Journey" },
];

const stepsLabel = (n) => `${n} ${n === 1 ? "step" : "steps"}`;

function UseRecipeDialog({ recipe, onOpenChange, onCreate }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState(recipe?.kind || "workflow");
  const [pending, setPending] = useState(false);
  const [seedKey, setSeedKey] = useState(recipe?.key);
  if (recipe && recipe.key !== seedKey) {
    setSeedKey(recipe.key);
    setKind(recipe.kind || "workflow");
  }
  if (!recipe) return null;

  const close = () => {
    if (pending) return;
    setName("");
    onOpenChange(null);
  };

  const submit = async () => {
    setPending(true);
    const ok = await onCreate(recipe, { name: name.trim() || recipe.name, kind });
    setPending(false);
    if (ok) {
      setName("");
      onOpenChange(null);
    }
  };

  return (
    <Dialog open={!!recipe} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Use “{recipe.name}”</DialogTitle>
          <DialogDescription>
            We&apos;ll create a draft pre-built with {stepsLabel(recipe.steps)}. Review the messages, then publish when it&apos;s ready.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name" htmlFor="rc-name">
            <Input
              id="rc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={recipe.name}
              autoFocus
            />
          </Field>
          <Field label="Create as" hint={kind === "journey" ? "Listed under Journeys, for cross-channel paths." : "Listed under Workflows."}>
            <SegmentedTabs tabs={KIND_TABS} value={kind} onChange={setKind} fullWidth />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {pending ? "Creating…" : "Create from recipe"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OverviewItem({ label, children }) {
  return (
    <div className="rounded-lg border border-border bg-surface-card px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">{label}</p>
      <p className="mt-1.5 text-sm text-foreground">{children}</p>
    </div>
  );
}

function settingsSummary(settings = {}) {
  const parts = [settings.reentry ? "Contacts can re-enter" : "Each contact enters once"];
  if (settings.exitOnGoal) parts.push("exits on goal");
  if (settings.quietHours?.enabled) parts.push(`quiet hours ${settings.quietHours.start}–${settings.quietHours.end}`);
  if (settings.frequencyCap?.enabled) parts.push(`at most ${settings.frequencyCap.max} messages per ${settings.frequencyCap.periodDays} days`);
  return parts.join(" · ");
}

function RecipeSteps({ recipe }) {
  const outline = useMemo(() => outlineGraph(recipe.built.graph), [recipe]);
  return (
    <SectionCard>
      <ol className="space-y-2">
        {outline.map((item, i) => {
          const prev = outline[i - 1];
          const startsBranch = item.depth > 0 && (prev?.depth !== item.depth || prev?.branch !== item.branch);
          const accent = ACCENT_CLASS[NODE_META[item.node.type]?.accent] || ACCENT_CLASS.neutral;
          return (
            <li key={item.node.id} style={{ marginLeft: item.depth * 24 }} className="space-y-1.5">
              {startsBranch ? <p className="pl-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">If {item.branch}</p> : null}
              <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-card px-4 py-3">
                <span className="w-5 shrink-0 text-xs font-medium tabular-nums text-text-tertiary">{i === 0 ? "" : i}</span>
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", accent)}>
                  <NodeIcon node={item.node} className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{nodeTitle(item.node)}</p>
                  <p className="truncate text-xs text-text-secondary">
                    {item.node.type === "trigger" ? describeTrigger(item.node.data?.config) : summarizeNode(item.node, { nodes: recipe.built.graph.nodes })}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}

// Curated recipes are read-only; the editor previews them before "Use recipe".
function RecipeEditor({ record, usedCount, canEdit, onBack, onUse }) {
  const Icon = RECIPE_ICONS[record.key] || BookOpen;
  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-foreground">
            <Icon className="h-4 w-4" />
          </span>
          <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{record.name}</h1>
        </div>
      }
      badges={
        <>
          <Badge variant="neutral">{record.category}</Badge>
          <span className="text-xs text-text-tertiary">{KIND_COPY[record.kind].title.slice(0, -1)} · {stepsLabel(record.steps)}</span>
          {usedCount ? <span className="text-xs text-text-tertiary">· Used {usedCount}×</span> : null}
        </>
      }
      actions={
        canEdit ? (
          <Button onClick={() => onUse(record)}>
            <Sparkles className="h-4 w-4" /> Use recipe
          </Button>
        ) : null
      }
      nav={RECIPE_NAV}
      defaultSection="overview"
    >
      {({ active }) => (
        <>
          {active === "overview" ? (
            <SectionCard bare title="At a glance" description={record.description} contentClassName="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <OverviewItem label="Starts when">{describeTrigger(record.built.trigger)}</OverviewItem>
                <OverviewItem label="Goal">{record.goalText}</OverviewItem>
                <OverviewItem label="Best for">{record.audience}</OverviewItem>
              </div>
              <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                <OverviewItem label="Channels">{record.channels.map((c) => CHANNEL_META[c].label).join(", ") || "None"}</OverviewItem>
                <OverviewItem label="Settings">{settingsSummary(record.built.settings)}</OverviewItem>
              </div>
            </SectionCard>
          ) : null}

          {active === "steps" ? <RecipeSteps recipe={record} /> : null}
        </>
      )}
    </EditorShell>
  );
}

export function RecipesScreen() {
  const { projectId } = useProject();
  const canEdit = useCan("campaign.automation.edit");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [active, setActive] = useState(null);
  const [automations, setAutomations] = useState(null);
  const [userId, setUserId] = useState(null);
  const { recordId, openRecord, closeRecord, openRecordInTab } = useWorkspaceUrl();

  useEffect(() => {
    let alive = true;
    listAutomations(projectId).then((rows) => alive && setAutomations(rows ?? []));
    getUser().then((u) => alive && setUserId(u?.id ?? null));
    return () => {
      alive = false;
    };
  }, [projectId]);

  const usage = useMemo(() => {
    const counts = {};
    for (const a of automations || []) if (a.recipe) counts[a.recipe] = (counts[a.recipe] || 0) + 1;
    return counts;
  }, [automations]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return RECIPE_ROWS.filter(
      (r) => (category === "All" || r.category === category) && (!q || `${r.name} ${r.description}`.toLowerCase().includes(q)),
    );
  }, [query, category]);

  const stats = useMemo(() => {
    const created = Object.values(usage).reduce((s, n) => s + n, 0);
    return [
      { label: "Recipes", value: formatNumber(RECIPE_ROWS.length) },
      { label: "Categories", value: formatNumber(new Set(RECIPE_ROWS.map((r) => r.category)).size) },
      {
        label: "Created from recipes",
        value: automations === null ? "—" : formatNumber(created),
        footer: automations === null ? "Loading" : `${Object.keys(usage).length} of ${RECIPE_ROWS.length} recipes used`,
      },
    ];
  }, [usage, automations]);

  const createFromRecipe = async (recipe, { name, kind }) => {
    const id = crypto.randomUUID();
    const built = recipe.build();
    const saved = await createAutomation(projectId, {
      id,
      kind,
      name,
      description: recipe.description,
      graph: built.graph,
      settings: built.settings,
      metadata: { recipe: recipe.key },
      createdBy: userId,
    });
    if (!saved) {
      toast.error("Couldn't create it from the recipe.");
      return false;
    }
    setAutomations((p) => [saved, ...(p || [])]);
    toast.success(`“${saved.name}” created as a draft ${kind}.`);
    openRecordInTab(saved.id, KIND_COPY[kind].title);
    return true;
  };

  const recipeDialog = <UseRecipeDialog recipe={active} onOpenChange={setActive} onCreate={createFromRecipe} />;

  const open = RECIPE_ROWS.find((r) => r.key === recordId);
  if (open) {
    return (
      <>
        <RecipeEditor key={open.key} record={open} usedCount={usage[open.key] || 0} canEdit={canEdit} onBack={closeRecord} onUse={setActive} />
        {recipeDialog}
      </>
    );
  }

  const filtersActive = query || category !== "All";

  // Enter/Space on the card itself opens it; keys from inner controls are ignored.
  const onCardKey = (e, key) => {
    if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    openRecord(key);
  };

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Recipes"
        description="Pre-built automations you can start as a draft and tailor before publishing."
      />

      <StatsBar stats={stats} columns={3} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={category} onValueChange={setCategory} options={CATEGORY_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search recipes…" />
      </Toolbar>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((r) => {
          const Icon = RECIPE_ICONS[r.key] || BookOpen;
          const used = usage[r.key] || 0;
          return (
            <div
              key={r.key}
              role="button"
              tabIndex={0}
              aria-label={`Open ${r.name}`}
              onClick={() => openRecord(r.key)}
              onKeyDown={(e) => onCardKey(e, r.key)}
              className="group flex cursor-pointer flex-col rounded-xl border border-border bg-surface-subtle p-5 transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-active text-foreground">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="flex items-center gap-1">
                  <Badge variant="neutral">{r.category}</Badge>
                  <div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <ActionMenu
                      label={`Actions for ${r.name}`}
                      items={[
                        { label: "Open recipe", icon: Eye, onSelect: () => openRecord(r.key) },
                        canEdit && { label: "Use recipe", icon: Sparkles, onSelect: () => setActive(r) },
                      ]}
                    />
                  </div>
                </div>
              </div>
              <h3 className="mt-4 font-medium text-foreground">{r.name}</h3>
              <p className="mt-1 flex-1 text-sm text-text-secondary">{r.description}</p>
              <div className="mt-4 flex items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-text-secondary">
                  <BookOpen className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {stepsLabel(r.steps)} · {r.channels.map((c) => CHANNEL_META[c].label).join(", ")}
                    {used ? ` · used ${used}×` : ""}
                  </span>
                </span>
                {canEdit ? (
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActive(r);
                    }}
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Use recipe
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <EmptyState
          icon={BookOpen}
          title={filtersActive ? "No recipes found" : "No recipes yet"}
          description={filtersActive ? "No recipes match your filters." : "Recipes will appear here as they're added to the library."}
          className="rounded-xl border border-border bg-surface-subtle"
          action={
            filtersActive ? (
              <Button
                variant="outline"
                className={OUTLINE_BUTTON}
                onClick={() => {
                  setQuery("");
                  setCategory("All");
                }}
              >
                Clear filters
              </Button>
            ) : null
          }
        />
      )}

      {recipeDialog}
    </MainScreenWrapper>
  );
}

export default RecipesScreen;
