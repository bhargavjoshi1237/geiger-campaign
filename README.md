<div align="center">

# Geiger Campaign

**Run marketing campaigns.**

Audience, email, SMS, WhatsApp, automations, and deliverability — the whole lifecycle marketing stack in one workspace.

Part of the [Geiger](#the-geiger-suite) suite.

</div>

---

## Overview

Geiger Campaign is the marketing application of the Geiger suite. It brings the pieces marketers normally stitch together — a contact database, a campaign builder, multi-channel sending, journey automation, transactional email infrastructure, deliverability tooling, and reporting — under one workspace and one design language.

The product spans the full arc: capture an audience through forms and landing pages, segment and score it, build and test a campaign, send it across email, SMS, WhatsApp, push, or in-app, automate the follow-up, and measure what it earned.

## Highlights

| Area | What it does |
| --- | --- |
| **Audience** | Contacts, lists, segments, tags and custom fields, lead scoring, and suppression. |
| **Campaigns** | Campaign list and calendar, an email builder, templates and content blocks, personalisation, A/B testing, and send-time optimisation. |
| **Automations** | Journeys, triggers, workflows, conditions and goals, and prebuilt recipes. |
| **Channels** | Email, SMS, WhatsApp, push, and in-app messaging. |
| **Transactional** | Email API, SMTP relay, transactional templates, inbound routing, and message logs. |
| **Deliverability** | Sending domains and authentication, dedicated IPs, IP warmup, inbox placement, blocklist monitoring, and email validation. |
| **Inbox** | Unified conversations across SMS, WhatsApp, and live chat. |
| **Acquisition** | Forms, landing pages, popups, surveys, and source tracking. |
| **Commerce** | Stores, products, orders, coupons, abandoned carts, and product recommendations. |
| **CRM** | Companies, deals, pipelines, tasks, and an activity timeline. |
| **Content** | Asset library, brand kit, files, and an image editor. |
| **Reporting** | Dashboards, engagement, attribution, campaign comparison, deliverability reports, and custom reports. |
| **AI assistant** | Campaign briefs, copy generation, subject lines, segment suggestions, and campaign health checks. |
| **Data** | Custom objects, catalogs, event tracking, and warehouse sync. |
| **Integrations** | Apps, webhooks, and API keys. |

## Status

The workspace navigation and every screen in the areas above are built out against the suite's shared screen kit. Persistence is being wired area by area — the app currently ships the organisation shell (overview, projects, reporting, inbox, team, roles, usage, billing, settings) against Supabase, with per-area data layers landing progressively.

## Tech stack

- **Framework** — Next.js 16 (App Router, SSR/SSG) and React 19
- **Styling** — Tailwind CSS v4 and shadcn/ui, with the shared [`@geiger/ui`](https://github.com/bhargavjoshi1237/geiger-ui) component library
- **Icons** — Lucide
- **Backend** — Supabase (Postgres, Auth, Storage)
- **Charts** — Recharts

## Getting started

### Prerequisites

- Node.js 20 or later
- A Supabase project (the shared Geiger project)

### Installation

```bash
npm install
```

### Environment

Create a `.env` file in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Develop

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. In production the app is served under the `/campaign` base path behind the suite hub.

## Project structure

```
app/
  project/[projectId]/   Project-scoped campaign workspace
  org/                   Organisation surfaces
  home/                  Marketing landing
  pallet/, palletw/      Dark and light palette references
components/
  internal/screens/      Workspace screens by area
    audience/  campaigns/  automations/  channels/  transactional/
    deliverability/  inbox/  acquisition/  commerce/  crm/
    content/  reporting/  ai_assistant/  data/  integrations/  settings/
  internal/shared/       Shared screen kit (headers, tables, stats, dialogs)
  campaign-playground/   Interactive landing-page demos
  ui/                    shadcn primitives
lib/supabase/            Supabase client, user, and activity tracking
docs/                    Competitive research
```

## Conventions

This codebase follows a consistent set of patterns. Read these before contributing:

- [`AGENTS.md`](AGENTS.md) — working notes for this Next.js version
- [`MODULE_CONVENTIONS.md`](MODULE_CONVENTIONS.md) — how to build a workspace screen
- [`SUPABASE_CONVENTIONS.md`](SUPABASE_CONVENTIONS.md) — the data-layer playbook
- [`MIGRATION_CONVENTIONS.md`](MIGRATION_CONVENTIONS.md) — schema changes and `@geiger/orm`
- [`crafting.md`](crafting.md) — UI craft and quality bar

## The Geiger suite

Geiger Campaign is one application in the broader Geiger suite, alongside Geiger Flow, Geiger Events, and Geiger Notes. Every product shares one Supabase project, a common design language, and the [`@geiger/ui`](https://github.com/bhargavjoshi1237/geiger-ui) component library, so each app feels native to the whole.

## License

Private and unpublished. All rights reserved.
