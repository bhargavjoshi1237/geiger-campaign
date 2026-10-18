import Link from "next/link";
import { ArrowRight, Megaphone, BarChart3, Users, FileText, Calendar, DollarSign } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Card,
  Footer,
} from "@geiger/ui";
import { SiteHeader } from "@/components/landing/site-header";
import LandingCampaignShowcase from "@/components/campaign-playground/LandingCampaignShowcase";

const showcaseBackgroundImages = [
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-00a586c62c8782e65c0a.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/internal-brand-023-3291bb4c.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-0ec1f3ba625f482c9dc3.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-85923e7fafe00c9c0d1f.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-8e2e88cff7f33224ddd7.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-0a66efa21dd4b7e6c526.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-cc24ca462279ca23250c.jpg",
];

function pickRandomShowcaseBackground() {
  return showcaseBackgroundImages[Math.floor(Math.random() * showcaseBackgroundImages.length)];
}

export const metadata = {
  title: "Campaign - Geiger Studio",
  description: "Plan, launch, and track campaigns in one focused workspace.",
};

const features = [
  { title: "Campaign Management", description: "Create and manage campaigns end-to-end from a single dashboard.", icon: Megaphone },
  { title: "Analytics", description: "Track performance metrics and campaign results in real time.", icon: BarChart3 },
  { title: "Audience Targeting", description: "Define and segment your audience for precise campaign delivery.", icon: Users },
  { title: "Content Library", description: "Organize creative assets and content templates in one place.", icon: FileText },
  { title: "Schedule & Publish", description: "Plan campaign timelines and automate publishing schedules.", icon: Calendar },
  { title: "Budget Tracking", description: "Monitor spend, forecast costs, and stay within budget.", icon: DollarSign },
];

const faqs = [
  { question: "What is Geiger Campaign?", answer: "Geiger Campaign is a workspace for planning, launching, and tracking marketing campaigns across your organization." },
  { question: "Where is the workspace?", answer: "The full Campaign workspace lives at /home once you're signed in." },
  { question: "Can I manage multiple campaigns at once?", answer: "Yes. The workspace is built to handle multiple campaigns with independent timelines, budgets, and audiences." },
  { question: "Is it part of Geiger Studio?", answer: "Yes. Campaign is one product in the Geiger Studio suite, sharing authentication and profile management with other tools." },
];

export default function CampaignLandingPage() {
  const showcaseBg = pickRandomShowcaseBackground();
  return (
    <div className="flex min-h-screen w-full flex-col bg-background font-sans text-foreground selection:bg-indigo-500/30">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(to_right,#80808030_1px,transparent_1px),linear-gradient(to_bottom,#80808030_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

      <SiteHeader productName="Campaign" ctaHref="/org" />

      <main className="relative z-10 flex flex-1 flex-col pt-16 sm:pt-20">
        <section className="mx-auto mb-10 mt-10 flex w-full max-w-6xl items-start justify-start px-4 sm:mt-16 sm:px-6">
          <div className="max-w-3xl">
            <h1 className="mb-4 text-2xl font-semibold text-foreground sm:text-3xl">
              Plan, launch, and track campaigns in one workspace.
            </h1>
            <p className="mb-6 max-w-xl text-sm text-muted-foreground sm:text-base">
              Geiger Campaign brings campaign management, audience targeting, content scheduling, and analytics into a focused workspace for your team.
            </p>
            <Button asChild size="lg" className="rounded-full px-6">
              <Link href="/org">
                Continue to Campaign
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        <div className="mx-auto my-10 w-[94%] sm:my-20 md:w-[80%]">
          <LandingCampaignShowcase backgroundImage={showcaseBg} />
        </div>

        <section id="features" className="mx-auto grid w-full max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-3">
          {features.map(({ title, description, icon: Icon }) => (
            <Card key={title} className="gap-0 rounded-xl border-border bg-surface-subtle p-5">
              <Icon className="mb-3 h-5 w-5 text-muted-foreground" />
              <h2 className="font-medium text-foreground">{title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            </Card>
          ))}
        </section>

        <section className="mx-auto mt-16 flex w-full max-w-6xl flex-col gap-6 px-4 sm:px-6 md:flex-row">
          <div className="md:w-[35%]">
            <h2 className="text-3xl font-semibold text-foreground">Questions & Answers</h2>
          </div>
          <div className="md:w-[65%]">
            <Accordion type="single" collapsible>
              {faqs.map(({ question, answer }) => (
                <AccordionItem key={question} value={question} className="border-border">
                  <AccordionTrigger className="text-foreground">{question}</AccordionTrigger>
                  <AccordionContent className="leading-6 text-muted-foreground">{answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        <section className="px-4 py-24 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col items-center text-center">
            <h2 className="mb-8 bg-gradient-to-b from-zinc-900 to-zinc-500 dark:from-white bg-clip-text text-4xl font-black tracking-tight text-transparent">
              TRY GEIGER NOW
            </h2>
            <Button asChild size="lg" className="rounded-full px-6">
              <Link href="/org">
                Open Campaign
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
