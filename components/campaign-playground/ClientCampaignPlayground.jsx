"use client";

import dynamic from "next/dynamic";
import { LogoLoading } from "@geiger/ui";

const CampaignPlayground = dynamic(
  () =>
    import("@/components/campaign-playground/CampaignPlayground").then(
      (mod) => mod.CampaignPlayground,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <LogoLoading size={80} />
      </div>
    ),
  },
);

export default CampaignPlayground;
