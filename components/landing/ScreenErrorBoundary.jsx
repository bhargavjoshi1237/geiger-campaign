"use client";

import React from "react";
import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";

// Keeps one screen tripping over unexpected data from blanking the landing playground; key it by tab so switching resets it.
export class ScreenErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("[playground] screen failed to render", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    const title = this.props.title || "This screen";
    return (
      <MainScreenWrapper>
        <EmptyState
          icon={TriangleAlert}
          title={`${title} couldn't load in the playground`}
          description="Pick another screen from the sidebar, or open the workspace to see this one with your own data."
        />
      </MainScreenWrapper>
    );
  }
}

export default ScreenErrorBoundary;
