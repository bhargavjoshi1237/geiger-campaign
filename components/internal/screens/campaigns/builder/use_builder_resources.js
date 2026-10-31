"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getBrandKit } from "@/lib/supabase/brand_kits";
import { listCustomFields } from "@/lib/supabase/custom_fields";
import { listContentBlocks } from "@/lib/supabase/content_blocks";
import { mergeTagGroups } from "@/lib/email/merge_tags";

// What every builder surface needs besides the document: the brand kit (preview fidelity), merge fields
// (contact + custom fields) and the project's saved content blocks.
export function useBuilderResources(projectId) {
  const [state, setState] = useState({ loadedFor: null, brand: null, customFields: [], savedBlocks: [] });

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    Promise.all([getBrandKit(projectId), listCustomFields(projectId), listContentBlocks(projectId)]).then(([brand, fields, blocks]) => {
      if (!alive) return;
      setState({ loadedFor: projectId, brand: brand || null, customFields: fields ?? [], savedBlocks: blocks ?? [] });
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const groups = useMemo(() => mergeTagGroups(state.customFields), [state.customFields]);

  const setSavedBlocks = useCallback(
    (fn) => setState((s) => ({ ...s, savedBlocks: typeof fn === "function" ? fn(s.savedBlocks) : fn })),
    [],
  );

  return {
    loading: state.loadedFor !== projectId,
    brand: state.brand,
    customFields: state.customFields,
    savedBlocks: state.savedBlocks,
    groups,
    setSavedBlocks,
  };
}

export default useBuilderResources;
