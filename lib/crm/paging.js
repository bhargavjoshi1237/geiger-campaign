// Reads past PostgREST's per-request row cap: `build()` returns a fresh filtered query, fetched page by
// page with .range() until `limit` rows or a short page. Resolves { data, error } like supabase-js.

const PAGE = 1000;

export async function pagedSelect(build, limit = PAGE) {
  const rows = [];
  for (let from = 0; from < limit; from += PAGE) {
    const to = Math.min(limit, from + PAGE) - 1;
    const { data, error } = await build().range(from, to);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < to - from + 1) break;
  }
  return { data: rows, error: null };
}
