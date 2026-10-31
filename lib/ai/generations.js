// Server-side writes to campaign.ai_generations: every successful AI tool run is stored (validated input +
// normalized output) under the caller's RLS, so it shows up in the screen's history for reuse. A failed
// write is logged and the generation is still returned — losing history never loses the answer.

export function toGeneration(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    tool: row.tool,
    title: row.title ?? "",
    input: row.input && typeof row.input === "object" ? row.input : {},
    output: row.output && typeof row.output === "object" ? row.output : {},
    model: row.model ?? "",
    campaignId: row.campaign_id ?? null,
    segmentId: row.segment_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
  };
}

export async function recordGeneration(db, { projectId, tool, title, input, output, model, userId }) {
  try {
    const { data, error } = await db
      .from("ai_generations")
      .insert({
        project_id: projectId,
        tool,
        title: String(title || "").slice(0, 120),
        input,
        output,
        model: model || "",
        created_by: userId || null,
      })
      .select("*")
      .single();
    if (error) {
      console.error("[ai.generations.record]", error.message);
      return null;
    }
    return toGeneration(data);
  } catch (e) {
    console.error("[ai.generations.record]", e);
    return null;
  }
}
