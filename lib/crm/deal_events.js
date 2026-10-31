// JS mirror of the deals triggers in supabase/migrations/*_crm.sql, over raw snake_case rows. The real
// database runs the SQL; the landing playground (in-memory db) applies these so its history matches.

export function stageNameIn(pipelines, pipelineId, stageId) {
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const stage = (pipeline?.stages || []).find((s) => s.id === stageId);
  return stage?.name || "";
}

// crm_deals_before_write: default stage + won/lost timestamps. Returns the columns to set.
export function dealDerivedFields(oldRow, next, pipelines, nowIso) {
  const patch = {};
  if (!next.stage_id) {
    const pipeline = pipelines.find((p) => p.id === next.pipeline_id);
    patch.stage_id = pipeline?.stages?.[0]?.id || "";
  }
  if (!oldRow || next.status !== oldRow.status) {
    if (next.status === "won") {
      patch.won_at = next.won_at || nowIso;
      patch.lost_at = null;
      patch.lost_reason = "";
    } else if (next.status === "lost") {
      patch.lost_at = next.lost_at || nowIso;
      patch.won_at = null;
    } else {
      patch.won_at = null;
      patch.lost_at = null;
      patch.lost_reason = "";
    }
  }
  return patch;
}

function activity(row, fields, { nowIso, newId }) {
  return {
    id: newId(),
    project_id: row.project_id,
    kind: "stage_change",
    subject: "",
    body: "",
    related_type: "deal",
    related_id: row.id,
    contact_id: row.contact_id ?? null,
    actor_id: null,
    occurred_at: nowIso,
    metadata: {},
    created_by: null,
    created_at: nowIso,
    updated_at: nowIso,
    deleted_at: null,
    ...fields,
  };
}

// crm_deals_after_write (history half): crm_activities rows for a create, stage move or status change.
export function dealHistoryRows(oldRow, row, { pipelines, nowIso, actorId = null, newId }) {
  if (row.deleted_at) return [];
  const ctx = { nowIso, newId };
  const name = (pipelineId, stageId) => stageNameIn(pipelines, pipelineId, stageId);
  if (!oldRow) {
    return [
      activity(row, {
        kind: "system",
        subject: "Deal created",
        actor_id: actorId ?? row.created_by ?? null,
        occurred_at: row.created_at || nowIso,
        metadata: {
          event: "created",
          pipelineId: row.pipeline_id,
          toStageId: row.stage_id,
          toStageName: name(row.pipeline_id, row.stage_id),
          toStatus: row.status,
          value: Number(row.value) || 0,
          currency: row.currency,
        },
      }, ctx),
    ];
  }
  const rows = [];
  if (row.pipeline_id !== oldRow.pipeline_id || row.stage_id !== oldRow.stage_id) {
    rows.push(activity(row, {
      subject: `Moved to ${name(row.pipeline_id, row.stage_id) || "another stage"}`,
      actor_id: actorId,
      metadata: {
        event: "stage",
        fromPipelineId: oldRow.pipeline_id,
        pipelineId: row.pipeline_id,
        fromStageId: oldRow.stage_id,
        toStageId: row.stage_id,
        fromStageName: name(oldRow.pipeline_id, oldRow.stage_id),
        toStageName: name(row.pipeline_id, row.stage_id),
        value: Number(row.value) || 0,
        currency: row.currency,
      },
    }, ctx));
  }
  if (row.status !== oldRow.status) {
    rows.push(activity(row, {
      subject: row.status === "won" ? "Marked won" : row.status === "lost" ? "Marked lost" : "Reopened",
      body: row.status === "lost" ? row.lost_reason || "" : "",
      actor_id: actorId,
      metadata: {
        event: "status",
        pipelineId: row.pipeline_id,
        stageId: row.stage_id,
        stageName: name(row.pipeline_id, row.stage_id),
        fromStatus: oldRow.status,
        toStatus: row.status,
        lostReason: row.lost_reason || "",
        value: Number(row.value) || 0,
        currency: row.currency,
      },
    }, ctx));
  }
  return rows;
}

function wonProperties(row) {
  return {
    dealId: row.id,
    dealName: row.name,
    pipelineId: row.pipeline_id,
    stageId: row.stage_id,
    companyId: row.company_id ?? null,
    ownerId: row.owner_id ?? null,
    sourceCampaignId: row.source_campaign_id ?? null,
  };
}

// crm_deals_after_write (attribution half): keeps one live deal_won tracked event per won deal.
// Returns { insert, update: [event, patch] | null, retract: events[] } against `trackedEvents`.
export function dealWonSync(oldRow, row, { trackedEvents, nowIso, newId }) {
  const live = trackedEvents.filter(
    (e) => e.name === "deal_won" && !e.deleted_at && e.project_id === row.project_id && e.properties?.dealId === row.id,
  );
  if (row.deleted_at) return { insert: null, update: null, retract: oldRow && !oldRow.deleted_at ? live : [] };
  if (row.status === "won") {
    if (!live.length) {
      return {
        insert: {
          id: newId(),
          project_id: row.project_id,
          contact_id: row.contact_id ?? null,
          anonymous_id: null,
          name: "deal_won",
          properties: wonProperties(row),
          source: "system",
          delivery_id: null,
          campaign_id: row.source_campaign_id ?? null,
          revenue: Number(row.value) || 0,
          currency: row.currency || "USD",
          url: null,
          referrer: null,
          utm: {},
          occurred_at: row.won_at || nowIso,
          metadata: {},
          created_by: null,
          created_at: nowIso,
          updated_at: nowIso,
          deleted_at: null,
        },
        update: null,
        retract: [],
      };
    }
    return {
      insert: null,
      update: [
        live[0],
        {
          revenue: Number(row.value) || 0,
          currency: row.currency || "USD",
          contact_id: row.contact_id ?? null,
          campaign_id: row.source_campaign_id ?? null,
          properties: wonProperties(row),
          updated_at: nowIso,
        },
      ],
      retract: [],
    };
  }
  return { insert: null, update: null, retract: oldRow?.status === "won" ? live : [] };
}
