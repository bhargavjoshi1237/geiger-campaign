import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Megaphone, BarChart3, Users, FileText, Calendar, DollarSign } from "lucide-react";
import { SiteHeader } from "@/components/landing/site-header";
import LandingCampaignShowcase from "@/components/campaign-playground/LandingCampaignShowcase";

const assetPrefix = process.env.NEXT_PUBLIC_BASE_PATH || "";

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

function FaqItem({ question, answer }) {
  return (
    <details className="group border-b border-border py-4">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-sm font-medium text-foreground transition-colors hover:text-foreground">
        {question}
        <span className="mt-0.5 text-foreground0 transition-transform group-open:rotate-45">+</span>
      </summary>
      <p className="pt-3 text-sm leading-6 text-muted-foreground">{answer}</p>
    </details>
  );
}

function Footer() {
  return (
    <footer className="relative z-30 border-t border-border/50 bg-background px-6 pb-8 pt-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2">
            <div className="mb-4 flex items-center gap-2">
              <Image src={`${assetPrefix}/logo1.svg`} alt="Logo" width={20} height={20} />
              <span className="bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-base font-bold tracking-tight text-transparent">
                Geiger Studios
              </span>
            </div>
            <p className="max-w-sm text-sm text-foreground0">Built to Manage. Designed to Create.</p>
          </div>
          <div>
            <h4 className="mb-4 font-bold text-foreground">Product</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/home" className="transition-colors hover:text-foreground">Workspace</Link></li>
              <li><Link href="#features" className="transition-colors hover:text-foreground">Features</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4 font-bold text-foreground">Company</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="#" className="transition-colors hover:text-foreground">About</Link></li>
              <li><Link href="#" className="transition-colors hover:text-foreground">Contact</Link></li>
            </ul>
          </div>
        </div>
        <div className="flex flex-col items-center justify-between gap-4 border-t border-border/50 pt-8 text-sm text-foreground0 md:flex-row">
          <p>&copy; {new Date().getFullYear()} Geiger Studios. All rights reserved.</p>
        </div>
      </div>
      <div className="relative z-0 mt-10 flex justify-center">
        <h1 className="pointer-events-none select-none text-[13vw] font-bold leading-none tracking-tight text-foreground/5">
          GEIGER STUDIO
        </h1>
      </div>
    </footer>
  );
}

export default function CampaignLandingPage() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-background font-sans text-foreground selection:bg-indigo-500/30">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(to_right,#80808030_1px,transparent_1px),linear-gradient(to_bottom,#80808030_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

      <SiteHeader productName="Campaign" />

      <main className="relative z-10 flex flex-1 flex-col pt-16 sm:pt-20">
        <section className="mx-auto mb-10 mt-10 flex w-full max-w-6xl items-start justify-start px-4 sm:mt-16 sm:px-6">
          <div className="max-w-3xl">
            <h1 className="mb-4 text-2xl font-semibold text-white sm:text-3xl">
              Plan, launch, and track campaigns in one workspace.
            </h1>
            <p className="mb-6 max-w-xl text-sm text-muted-foreground sm:text-base">
              Geiger Campaign brings campaign management, audience targeting, content scheduling, and analytics into a focused workspace for your team.
            </p>
            <Link
              href="/home"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-zinc-100 px-6 text-sm font-medium text-zinc-950 transition-colors hover:bg-white sm:text-base"
            >
              Continue to Campaign
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <div className="mx-auto my-10 w-[94%] sm:my-20 md:w-[80%]">
          <LandingCampaignShowcase />
        </div>

        <section id="features" className="mx-auto grid w-full max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-3">
          {features.map(({ title, description, icon: Icon }) => (
            <article key={title} className="rounded-sm border border-border bg-[#191919] p-5">
              <Icon className="mb-3 h-5 w-5 text-muted-foreground" />
              <h2 className="font-medium text-foreground">{title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            </article>
          ))}
        </section>

        <section className="mx-auto mt-16 flex w-full max-w-6xl flex-col gap-6 px-4 sm:px-6 md:flex-row">
          <div className="md:w-[35%]">
            <h2 className="text-3xl font-semibold text-white">Questions & Answers</h2>
          </div>
          <div className="md:w-[65%]">
            {faqs.map((faq) => <FaqItem key={faq.question} {...faq} />)}
          </div>
        </section>

        <section className="px-4 py-24 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col items-center text-center">
            <h2 className="mb-8 bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-4xl font-black tracking-tight text-transparent">
              TRY GEIGER NOW
            </h2>
            <Link
              href="/home"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-zinc-100 px-6 text-sm font-medium text-zinc-950 transition-colors hover:bg-white"
            >
              Open Campaign
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
