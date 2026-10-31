"use client";

import { useCallback, useEffect, useState } from "react";
import { listLists } from "@/lib/supabase/lists";
import { listTags } from "@/lib/supabase/tags";
import { listCustomFields } from "@/lib/supabase/custom_fields";

const EMPTY = { lists: [], tags: [], customFields: [] };

// Lists, the tag catalog and custom field definitions for the active project — the vocabulary contact
// forms, imports, bulk actions and the segment builder share.
export function useAudienceCatalog(projectId) {
  const [state, setState] = useState({ key: null, ...EMPTY });

  const load = useCallback(
    () =>
      Promise.all([listLists(projectId), listTags(projectId), listCustomFields(projectId)]).then(([lists, tags, customFields]) => ({
        key: projectId,
        lists: lists ?? [],
        tags: tags ?? [],
        customFields: customFields ?? [],
      })),
    [projectId],
  );

  useEffect(() => {
    let alive = true;
    load().then((next) => alive && setState(next));
    return () => {
      alive = false;
    };
  }, [load]);

  const reload = useCallback(() => load().then(setState), [load]);

  return { ...state, loading: state.key !== projectId, reload, setCatalog: setState };
}
