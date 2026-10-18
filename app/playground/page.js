import ClientCampaignPlayground from "@/components/campaign-playground/ClientCampaignPlayground";

// The landing-page playground on its own route, so the showcase can iframe it and keep portalled dialogs inside the card.
export const metadata = {
  title: "Campaign Playground - Geiger Studio",
  robots: { index: false, follow: false },
};

export default function CampaignPlaygroundPage() {
  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-background">
      <ClientCampaignPlayground />
    </div>
  );
}
