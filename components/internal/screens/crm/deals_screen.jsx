"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  CalendarClock,
  Copy,
  Handshake,
  KanbanSquare,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Trophy,
  XCircle,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import {
  ActionMenu,
  Badge,
  Button,
  DataTable,
  EmptyState,
  LoadingArea,
  ScreenHeader,
  SearchInput,
  StatsBar,
  Toolbar,
  cn,
} from "@geiger/ui";
import { createDeal, listDeals, softDeleteDeal, updateDeal } from "@/lib/supabase/deals";
import { createPipeline, listPipelines, templateStages } from "@/lib/supabase/pipelines";
import { listCompanies } from "@/lib/supabase/companies";
import { listContacts } from "@/lib/supabase/contacts";
import { listCampaigns } from "@/lib/supabase/campaigns";
import { closeDeal } from "@/lib/crm/api";
import { DEAL_STATUS_FILTER_OPTIONS, stageColor } from "@/lib/crm/constants";
import { boardColumns, dealProbability, defaultPipeline, weightedValue } from "@/lib/crm/forecast";
import { dayKey, formatDate, formatMoney, moneySummary, percent } from "@/lib/crm/format";
import {
  DeleteDialog,
  LostReasonDialog,
  OUTLINE_BTN,
  PRIMARY_BTN,
  PersonChip,
  personName,
  recordLabel,
  useCrmPeople,
  useRecordIndex,
} from "./crm_shared";
import { CreateDealDialog, DealEditor, DealStatusBadge } from "./deal_editor";

const VIEW_OPTIONS = [
  { value: "board", label: "Board" },
  { value: "table", label: "Table" },
];

const CLOSED_LIMIT = 12;

function DealCard({ deal, pipeline, index, byId, me, canEdit, today, dragging, onDragStart, onDragEnd, onOpen, onMove, onSetStatus }) {
  const company = deal.companyId ? recordLabel(index, "company", deal.companyId) : "";
  const contact = deal.contactId ? recordLabel(index, "contact", deal.contactId) : "";
  const overdue = deal.status === "open" && deal.expectedCloseDate && deal.expectedCloseDate < today;
  const others = (pipeline?.stages || []).filter((s) => s.id !== deal.stageId);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={canEdit}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", deal.id);
        onDragStart(deal.id);
      }}
      onDragEnd={onDragEnd}
      aria-label={`Open ${deal.name}`}
      onClick={() => onOpen(deal)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        onOpen(deal);
      }}
      className={cn(
        "rounded-lg border border-border bg-surface-card p-3 transition-colors hover:border-border-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{deal.name}</p>
          {company || contact ? <p className="truncate text-xs text-text-secondary">{company || contact}</p> : null}
        </div>
        {canEdit ? (
          <ActionMenu
            label={`Actions for ${deal.name}`}
            className="-mr-1 -mt-1"
            items={[
              { label: "Open", icon: Pencil, onSelect: () => onOpen(deal) },
              deal.status === "open" && others.length ? { separator: true } : null,
              ...(deal.status === "open" ? others.map((s) => ({ label: `Move to ${s.name}`, icon: ArrowRight, onSelect: () => onMove(deal, s.id) })) : []),
              { separator: true },
              deal.status === "open" ? { label: "Mark won", icon: Trophy, onSelect: () => onSetStatus(deal, "won") } : null,
              deal.status === "open" ? { label: "Mark lost", icon: XCircle, onSelect: () => onSetStatus(deal, "lost") } : null,
              deal.status !== "open" ? { label: "Reopen", icon: RotateCcw, onSelect: () => onSetStatus(deal, "open") } : null,
            ]}
          />
        ) : null}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-sm tabular-nums text-foreground">{formatMoney(deal.value, deal.currency)}</span>
        <PersonChip name={personName(byId, deal.ownerId, me)} className="max-w-[9rem] text-xs text-muted-foreground" />
      </div>
      {deal.status === "open" && deal.expectedCloseDate ? (
        <p className={cn("mt-2 flex items-center gap-1 text-xs tabular-nums", overdue ? "text-red-600 dark:text-red-400" : "text-text-tertiary")}>
          <CalendarClock className="h-3 w-3" />
          {overdue ? "Close date passed · " : "Closes "}
          {formatDate(deal.expectedCloseDate)}
        </p>
      ) : null}
      {deal.status === "lost" && deal.lostReason ? <p className="mt-2 truncate text-xs text-text-tertiary">{deal.lostReason}</p> : null}
    </div>
  );
}

function BoardColumn({ id, title, accent, meta, children, empty, canEdit, isOver, onDragOver, onDragLeave, onDrop, className }) {
  return (
    <section
      aria-label={title}
      onDragOver={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver(id);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) onDragLeave(id);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(id, e.dataTransfer.getData("text/plain"));
      }}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border border-t-2 border-border bg-surface-subtle transition-colors",
        accent,
        isOver && "border-border-strong bg-surface-hover",
        className,
      )}
    >
      <header className="border-b border-border px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-medium text-foreground">{title}</h3>
          {meta.count != null ? <Badge variant="neutral" className="tabular-nums">{meta.count}</Badge> : null}
        </div>
        <p className="mt-0.5 text-xs tabular-nums text-text-secondary">{meta.line}</p>
      </header>
      <div className="flex-1 space-y-2 p-2">
        {children}
        {empty ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-text-tertiary">{empty}</p>
        ) : null}
      </div>
    </section>
  );
}

function DealBoard({ pipeline, deals, index, byId, me, canEdit, today, onOpen, onMove, onSetStatus }) {
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const columns = useMemo(() => boardColumns(pipeline, deals), [pipeline, deals]);
  const closed = useMemo(() => {
    const byClosed = (key) =>
      deals
        .filter((d) => d.pipelineId === pipeline.id && d.status === key)
        .sort((a, b) => String(b.wonAt || b.lostAt || "").localeCompare(String(a.wonAt || a.lostAt || "")));
    return { won: byClosed("won"), lost: byClosed("lost") };
  }, [deals, pipeline.id]);

  const drop = (target, dealId) => {
    setOverId(null);
    setDragId(null);
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || !canEdit) return;
    if (target === "won" || target === "lost") {
      if (deal.status !== target) onSetStatus(deal, target);
      return;
    }
    if (deal.status !== "open") {
      onSetStatus(deal, "open", target);
      return;
    }
    if (deal.stageId !== target) onMove(deal, target);
  };

  const dnd = {
    canEdit,
    onDragOver: setOverId,
    onDragLeave: (id) => setOverId((cur) => (cur === id ? null : cur)),
    onDrop: drop,
  };
  const cardProps = {
    pipeline,
    index,
    byId,
    me,
    canEdit,
    today,
    onDragStart: setDragId,
    onDragEnd: () => {
      setDragId(null);
      setOverId(null);
    },
    onOpen,
    onMove,
    onSetStatus,
  };

  if (!columns.length) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState icon={KanbanSquare} title="This pipeline has no stages" description="Add stages to the pipeline before placing deals on the board." />
      </div>
    );
  }

  const closedLine = (list) => {
    const sum = moneySummary(list, (d) => d.value);
    return list.length ? sum.value : "Drop a deal here";
  };

  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
      {columns.map(({ stage, deals: items }) => {
        const total = moneySummary(items, (d) => d.value);
        const weighted = moneySummary(items, (d) => weightedValue(d, pipeline));
        return (
          <BoardColumn
            key={stage.id}
            id={stage.id}
            title={stage.name}
            accent={stageColor(stage.color).border}
            meta={{ count: items.length, line: `${total.value} · ${stage.probability}% · ${weighted.value} weighted` }}
            empty={items.length ? null : canEdit ? "Drag deals here" : "No deals"}
            isOver={overId === stage.id}
            {...dnd}
          >
            {items.map((d) => <DealCard key={d.id} deal={d} dragging={dragId === d.id} {...cardProps} />)}
          </BoardColumn>
        );
      })}
      <BoardColumn
        id="won"
        title="Won"
        accent="border-t-emerald-500"
        meta={{ count: closed.won.length, line: closedLine(closed.won) }}
        empty={closed.won.length ? null : canEdit ? "Drop here to mark won" : "No won deals"}
        isOver={overId === "won"}
        className="w-64"
        {...dnd}
      >
        {closed.won.slice(0, CLOSED_LIMIT).map((d) => <DealCard key={d.id} deal={d} dragging={dragId === d.id} {...cardProps} />)}
        {closed.won.length > CLOSED_LIMIT ? <p className="px-1 text-xs text-text-tertiary">+{closed.won.length - CLOSED_LIMIT} more in the table view</p> : null}
      </BoardColumn>
      <BoardColumn
        id="lost"
        title="Lost"
        accent="border-t-red-500"
        meta={{ count: closed.lost.length, line: closedLine(closed.lost) }}
        empty={closed.lost.length ? null : canEdit ? "Drop here to mark lost" : "No lost deals"}
        isOver={overId === "lost"}
        className="w-64"
        {...dnd}
      >
        {closed.lost.slice(0, CLOSED_LIMIT).map((d) => <DealCard key={d.id} deal={d} dragging={dragId === d.id} {...cardProps} />)}
        {closed.lost.length > CLOSED_LIMIT ? <p className="px-1 text-xs text-text-tertiary">+{closed.lost.length - CLOSED_LIMIT} more in the table view</p> : null}
      </BoardColumn>
    </div>
  );
}

export function DealsScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const canEdit = can("campaign.crm.edit");
  const { recordId, openRecord, closeRecord, setTab } = useWorkspaceUrl();
  const { people, byId, me } = useCrmPeople(projectId);

  const [deals, setDeals] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loadedFor, setLoadedFor] = useState(null);
  const [today] = useState(() => dayKey(Date.now()));

  const [view, setView] = useState("board");
  // null = the default pipeline; "all" only applies to the table view.
  const [pipelineFilter, setPipelineFilter] = useState(null);
  const [statusFilter, setStatusFilter] = useState("open");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [lostTarget, setLostTarget] = useState(null);
  const [pending, setPending] = useState(false);
  const [creatingPipeline, setCreatingPipeline] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([listDeals(projectId), listPipelines(projectId), listCompanies(projectId), listContacts(projectId), listCampaigns(projectId)]).then(
      ([dealRows, pipelineRows, companyRows, contactRows, campaignRows]) => {
        if (!alive) return;
        if (dealRows === null || pipelineRows === null) toast.error("Couldn't load deals.");
        setDeals(dealRows ?? []);
        setPipelines(pipelineRows ?? []);
        setCompanies(companyRows ?? []);
        setContacts(contactRows ?? []);
        setCampaigns(campaignRows ?? []);
        setLoadedFor(projectId);
      },
    );
    return () => {
      alive = false;
    };
  }, [projectId]);

  const loading = loadedFor !== projectId;
  const index = useRecordIndex({ deals, companies, contacts });
  const pipelinesById = useMemo(() => new Map(pipelines.map((p) => [p.id, p])), [pipelines]);
  const fallbackPipeline = defaultPipeline(pipelines);
  const boardPipeline = pipelinesById.get(pipelineFilter) || fallbackPipeline;
  const allPipelines = view === "table" && pipelineFilter === "all";
  const scopePipelineId = allPipelines ? null : boardPipeline?.id;

  // Pipeline + owner scope; stats ignore the status and search filters.
  const scoped = useMemo(
    () =>
      deals.filter((d) => {
        if (scopePipelineId && d.pipelineId !== scopePipelineId) return false;
        if (ownerFilter === "me" && d.ownerId !== me?.id) return false;
        if (ownerFilter !== "all" && ownerFilter !== "me" && d.ownerId !== ownerFilter) return false;
        return true;
      }),
    [deals, scopePipelineId, ownerFilter, me],
  );

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((d) =>
      `${d.name} ${recordLabel(index, "company", d.companyId)} ${recordLabel(index, "contact", d.contactId)}`.toLowerCase().includes(q),
    );
  }, [scoped, search, index]);

  const filtered = useMemo(
    () => (statusFilter === "all" ? searched : searched.filter((d) => d.status === statusFilter)),
    [searched, statusFilter],
  );

  const stats = useMemo(() => {
    const open = scoped.filter((d) => d.status === "open");
    const won = scoped.filter((d) => d.status === "won");
    const lost = scoped.filter((d) => d.status === "lost");
    const value = moneySummary(open, (d) => d.value);
    const weighted = moneySummary(open, (d) => weightedValue(d, pipelinesById.get(d.pipelineId)));
    const month = today.slice(0, 7);
    const closingThisMonth = open.filter((d) => d.expectedCloseDate?.startsWith(month)).length;
    const winRate = percent(won.length, won.length + lost.length);
    return [
      { label: "Open deals", value: open.length.toLocaleString("en-US"), footer: `${closingThisMonth} expected to close this month` },
      { label: "Pipeline value", value: value.value, footer: value.footer || "Open deals at full value" },
      { label: "Weighted forecast", value: weighted.value, footer: weighted.footer || "Value × stage probability" },
      { label: "Win rate", value: winRate == null ? "—" : `${winRate}%`, footer: `${won.length} won · ${lost.length} lost` },
    ];
  }, [scoped, pipelinesById, today]);

  const pager = usePagination(filtered, { resetKey: `${pipelineFilter}|${statusFilter}|${ownerFilter}|${search}|${view}` });

  const ownerOptions = useMemo(
    () => [
      { value: "all", label: "All owners" },
      { value: "me", label: "My deals" },
      ...people.filter((p) => p.id !== me?.id).map((p) => ({ value: p.id, label: p.name })),
    ],
    [people, me],
  );

  // Mutations --------------------------------------------------------------

  const patchLocal = (id, patch) => setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const handleCreate = async (input) => {
    const deal = { id: crypto.randomUUID(), status: "open", createdBy: me?.id || null, ...input };
    setDeals((prev) => [{ ...deal, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...prev]);
    const saved = await createDeal(projectId, deal);
    if (!saved) {
      setDeals((prev) => prev.filter((d) => d.id !== deal.id));
      toast.error("Couldn't create the deal.");
      return false;
    }
    setDeals((prev) => prev.map((d) => (d.id === saved.id ? saved : d)));
    toast.success("Deal created.");
    openRecord(saved.id);
    return true;
  };

  const handleSave = async (id, patch) => {
    const before = deals.find((d) => d.id === id);
    patchLocal(id, patch);
    const saved = await updateDeal(id, patch);
    if (!saved) {
      if (before) patchLocal(id, before);
      toast.error("Couldn't save the deal.");
      return false;
    }
    patchLocal(id, saved);
    toast.success("Deal saved.");
    return true;
  };

  const moveStage = async (deal, stageId) => {
    const stage = pipelinesById.get(deal.pipelineId)?.stages.find((s) => s.id === stageId);
    patchLocal(deal.id, { stageId });
    const saved = await updateDeal(deal.id, { stageId });
    if (!saved) {
      patchLocal(deal.id, { stageId: deal.stageId });
      toast.error("Couldn't move the deal.");
      return;
    }
    patchLocal(deal.id, saved);
    toast.success(`Moved "${deal.name}" to ${stage?.name || "the new stage"}.`);
  };

  const applyStatus = async (deal, status, lostReason = "", stageId = null) => {
    setPending(true);
    const optimistic = { status, lostReason: status === "lost" ? lostReason : "", ...(stageId ? { stageId } : {}) };
    patchLocal(deal.id, optimistic);
    if (stageId && stageId !== deal.stageId) {
      const moved = await updateDeal(deal.id, { stageId });
      if (!moved) {
        patchLocal(deal.id, deal);
        setPending(false);
        toast.error("Couldn't move the deal.");
        return false;
      }
    }
    const res = await closeDeal(projectId, deal.id, { status, lostReason });
    setPending(false);
    if (!res.ok || !res.deal) {
      patchLocal(deal.id, deal);
      toast.error(res.error || "Couldn't update the deal.");
      return false;
    }
    patchLocal(deal.id, res.deal);
    toast.success(status === "won" ? `"${deal.name}" marked won.` : status === "lost" ? `"${deal.name}" marked lost.` : `"${deal.name}" reopened.`);
    return true;
  };

  // Lost needs a reason first; won and reopen apply straight away.
  const setStatus = (deal, status, stageId = null) => {
    if (status === "lost") {
      setLostTarget(deal);
      return;
    }
    applyStatus(deal, status, "", stageId);
  };

  const handleDuplicate = async (deal) => {
    const copy = {
      ...deal,
      id: crypto.randomUUID(),
      name: `${deal.name} (copy)`,
      status: "open",
      lostReason: "",
      wonAt: null,
      lostAt: null,
      createdBy: me?.id || null,
    };
    setDeals((prev) => [copy, ...prev]);
    const saved = await createDeal(projectId, copy);
    if (!saved) {
      setDeals((prev) => prev.filter((d) => d.id !== copy.id));
      toast.error("Couldn't duplicate the deal.");
      return;
    }
    setDeals((prev) => prev.map((d) => (d.id === saved.id ? saved : d)));
    toast.success("Deal duplicated.");
  };

  const handleDelete = async (deal) => {
    setDeleteTarget(null);
    setDeals((prev) => prev.filter((d) => d.id !== deal.id));
    if (recordId === deal.id) closeRecord();
    if (!(await softDeleteDeal(deal.id))) {
      setDeals((prev) => [deal, ...prev]);
      toast.error("Couldn't delete the deal.");
      return;
    }
    toast.success(`Deleted "${deal.name}".`);
  };

  const createStarterPipeline = async () => {
    setCreatingPipeline(true);
    const saved = await createPipeline(projectId, {
      id: crypto.randomUUID(),
      name: "Sales pipeline",
      stages: templateStages(),
      isDefault: true,
      createdBy: me?.id || null,
    });
    setCreatingPipeline(false);
    if (!saved) {
      toast.error("Couldn't create the pipeline.");
      return;
    }
    setPipelines([saved]);
    toast.success("Sales pipeline created.");
  };

  const dialogs = (
    <>
      <DeleteDialog
        open={!!deleteTarget}
        title="Delete deal"
        name={deleteTarget?.name}
        description="Its tasks and notes stay on the timeline; a won deal stops counting toward revenue."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => handleDelete(deleteTarget)}
      />
      <LostReasonDialog
        open={!!lostTarget}
        dealName={lostTarget?.name}
        pending={pending}
        onCancel={() => setLostTarget(null)}
        onConfirm={async (reason) => {
          const ok = await applyStatus(lostTarget, "lost", reason);
          if (ok) setLostTarget(null);
        }}
      />
    </>
  );

  // Detail -------------------------------------------------------------------

  const openDeal = !loading && recordId ? deals.find((d) => d.id === recordId) : null;
  if (openDeal) {
    return (
      <>
        <DealEditor
          key={openDeal.id}
          projectId={projectId}
          deal={openDeal}
          pipelines={pipelines}
          index={index}
          people={people}
          byId={byId}
          me={me}
          campaigns={campaigns}
          canEdit={canEdit}
          onBack={closeRecord}
          onSave={handleSave}
          onSetStatus={setStatus}
          onDelete={setDeleteTarget}
        />
        {dialogs}
      </>
    );
  }

  // List ---------------------------------------------------------------------

  const filtersActive = Boolean(search) || ownerFilter !== "all" || statusFilter !== "open";
  const clearFilters = () => {
    setSearch("");
    setOwnerFilter("all");
    setStatusFilter("open");
  };

  const columns = [
    {
      key: "deal",
      header: "Deal",
      render: (d) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{d.name}</span>
          <span className="truncate text-xs text-text-secondary">
            {[d.companyId && recordLabel(index, "company", d.companyId), d.contactId && recordLabel(index, "contact", d.contactId)].filter(Boolean).join(" · ") ||
              "No company or contact"}
          </span>
        </div>
      ),
    },
    { key: "stage", header: "Stage", render: (d) => <DealStatusBadge deal={d} pipeline={pipelinesById.get(d.pipelineId)} /> },
    {
      key: "value",
      header: "Value",
      align: "right",
      className: "whitespace-nowrap tabular-nums text-foreground",
      render: (d) => formatMoney(d.value, d.currency),
    },
    {
      key: "weighted",
      header: "Weighted",
      align: "right",
      className: "whitespace-nowrap tabular-nums text-muted-foreground",
      render: (d) => {
        const p = pipelinesById.get(d.pipelineId);
        return d.status === "open" ? `${formatMoney(weightedValue(d, p), d.currency)} · ${dealProbability(d, p)}%` : "—";
      },
    },
    { key: "owner", header: "Owner", className: "whitespace-nowrap text-muted-foreground", render: (d) => <PersonChip name={personName(byId, d.ownerId, me)} /> },
    {
      key: "close",
      header: "Close date",
      className: "whitespace-nowrap tabular-nums text-muted-foreground",
      render: (d) => {
        if (d.status === "won") return `Won ${formatDate(d.wonAt)}`;
        if (d.status === "lost") return `Lost ${formatDate(d.lostAt)}`;
        const overdue = d.expectedCloseDate && d.expectedCloseDate < today;
        return <span className={overdue ? "text-red-600 dark:text-red-400" : undefined}>{formatDate(d.expectedCloseDate)}</span>;
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (d) => (
        <ActionMenu
          label={`Actions for ${d.name}`}
          items={[
            { label: canEdit ? "Edit" : "Open", icon: Pencil, onSelect: () => openRecord(d.id) },
            canEdit ? { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(d) } : null,
            canEdit && d.status === "open" ? { label: "Mark won", icon: Trophy, onSelect: () => setStatus(d, "won") } : null,
            canEdit && d.status === "open" ? { label: "Mark lost", icon: XCircle, onSelect: () => setStatus(d, "lost") } : null,
            canEdit && d.status !== "open" ? { label: "Reopen", icon: RotateCcw, onSelect: () => setStatus(d, "open") } : null,
            canEdit ? { separator: true } : null,
            canEdit ? { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(d) } : null,
          ]}
        />
      ),
    },
  ];

  const newDealButton = canEdit && pipelines.length ? (
    <Button className={PRIMARY_BTN} onClick={() => setCreateOpen(true)}>
      <Plus className="h-4 w-4" /> New deal
    </Button>
  ) : null;

  let body;
  if (loading) {
    body = <LoadingArea size={56} panel label="Loading deals" />;
  } else if (!pipelines.length) {
    body = (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState
          icon={KanbanSquare}
          title="Set up a pipeline first"
          description={canEdit ? "Deals move through a pipeline's stages. Start with a standard sales pipeline and adjust its stages any time." : "Ask someone who manages the CRM to create a pipeline."}
          action={
            canEdit ? (
              <Button className={PRIMARY_BTN} disabled={creatingPipeline} onClick={createStarterPipeline}>
                {creatingPipeline ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create sales pipeline
              </Button>
            ) : null
          }
        />
      </div>
    );
  } else if (view === "board") {
    body = (
      <DealBoard
        pipeline={boardPipeline}
        deals={searched}
        index={index}
        byId={byId}
        me={me}
        canEdit={canEdit}
        today={today}
        onOpen={(d) => openRecord(d.id)}
        onMove={moveStage}
        onSetStatus={setStatus}
      />
    );
  } else {
    body = (
      <div className="space-y-5">
        <DataTable
          columns={columns}
          data={pager.pageItems}
          getRowKey={(d) => d.id}
          onRowClick={(d) => openRecord(d.id)}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={Handshake}
                title={deals.length ? "No deals match" : "No deals yet"}
                description={deals.length ? "Try a different search, owner or status." : "Create your first deal to start tracking your pipeline."}
                action={
                  deals.length && filtersActive ? (
                    <Button variant="outline" className={OUTLINE_BTN} onClick={clearFilters}>Clear filters</Button>
                  ) : (
                    newDealButton
                  )
                }
              />
            </div>
          }
        />
        <ListPagination {...pager} itemLabel="deals" />
      </div>
    );
  }

  const pipelineOptions = [
    ...(view === "table" ? [{ value: "all", label: "All pipelines" }] : []),
    ...pipelines.map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Deals"
        description="Every opportunity from first touch to close, weighted by stage."
        actions={
          <>
            {pipelines.length ? (
              <Button variant="outline" className={OUTLINE_BTN} onClick={() => setTab("Pipelines")}>Edit pipelines</Button>
            ) : null}
            {newDealButton}
          </>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={view} onValueChange={setView} options={VIEW_OPTIONS} height="h-9" />
          {pipelines.length ? (
            <FilterDropdown value={allPipelines ? "all" : boardPipeline?.id || ""} onValueChange={setPipelineFilter} options={pipelineOptions} placeholder="Pipeline" height="h-9" />
          ) : null}
          {view === "table" ? <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={DEAL_STATUS_FILTER_OPTIONS} height="h-9" /> : null}
          <FilterDropdown value={ownerFilter} onValueChange={setOwnerFilter} options={ownerOptions} height="h-9" />
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search deals, companies, contacts…" />
      </Toolbar>

      {body}

      {canEdit && pipelines.length ? (
        <CreateDealDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreate={handleCreate}
          pipelines={pipelines}
          index={index}
          people={people}
          me={me}
          campaigns={campaigns}
          defaults={{ pipelineId: boardPipeline?.id }}
        />
      ) : null}
      {dialogs}
    </MainScreenWrapper>
  );
}

export default DealsScreen;
