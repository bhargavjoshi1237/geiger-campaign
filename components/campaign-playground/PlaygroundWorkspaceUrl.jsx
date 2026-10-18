"use client";

import React, { useCallback, useMemo, useState } from "react";

import {
  WorkspaceUrlContext,
  DEFAULT_TAB,
  DEFAULT_SECTION,
} from "@/lib/hooks/use-workspace-url";

// In-memory stand-in for the routed workspace URL: the useWorkspaceUrl() API backed by React state, so browsing the
// playground never navigates the page it is embedded in.

const EMPTY_STATE = { tab: DEFAULT_TAB, record: null, section: DEFAULT_SECTION };
const STATE_KEYS = Object.keys(EMPTY_STATE);

export function PlaygroundWorkspaceUrlProvider({ projectId, children }) {
  const [state, setState] = useState(EMPTY_STATE);

  // Same patch semantics as the routed hook: `undefined` keeps a value, anything else (including null) replaces it.
  const apply = useCallback((next) => {
    setState((prev) => {
      const merged = { ...prev };
      for (const key of STATE_KEYS) {
        if (next[key] !== undefined) merged[key] = next[key];
      }
      return merged;
    });
  }, []);

  const value = useMemo(
    () => ({
      projectId,
      tab: state.tab || DEFAULT_TAB,
      recordId: state.record,
      section: state.section || DEFAULT_SECTION,
      // One project in the playground — nothing to switch to.
      setProject: () => {},
      setTab: (tab) => apply({ tab, record: null, section: null }),
      openRecord: (id) => apply({ record: id, section: null }),
      openRecordInTab: (id, tab) => apply({ tab, record: id, section: null }),
      closeRecord: () => apply({ record: null, section: null }),
      setSection: (section) => apply({ section }),
    }),
    [projectId, state, apply],
  );

  return (
    <WorkspaceUrlContext.Provider value={value}>
      {children}
    </WorkspaceUrlContext.Provider>
  );
}

export default PlaygroundWorkspaceUrlProvider;
