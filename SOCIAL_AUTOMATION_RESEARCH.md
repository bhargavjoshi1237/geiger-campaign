# Social & Conversational Campaign Automation — Market Research

**Date:** 2026-07-28
**Purpose:** Geiger Campaign today is an *email-first* marketing automation product (email builder,
deliverability, SMTP relay, lists/segments, journeys) with thin SMS/WhatsApp/Push channel stubs. It
has **no social-media campaign surface at all** — no comment-to-DM, no Instagram/Messenger/TikTok DM
automation, no WhatsApp broadcast/template management, no group/channel/community campaigns, no
social publishing, no social inbox, no click-to-message ads.

This document surveys what exists in that market, how those products actually work (including the
platform rules that constrain them), what they charge, and extracts a categorised feature taxonomy
that we map onto our sidebar.

---

## 1. TL;DR

- The segment is **conversational marketing / chat marketing**, and it is a genuinely separate
  product category from email marketing — different mechanics (permission windows instead of
  unsubscribe lists), different economics (per-message platform fees, not per-contact), and
  different growth loops (comments and ads instead of forms).
- The single highest-leverage feature in the whole space is **comment-to-DM**: a user comments a
  keyword on a Reel/post, the platform auto-replies publicly and opens a private DM. That one
  mechanic is what made ManyChat the category leader.
- There are **six distinct product archetypes** competing here (§4). Nobody covers all six well —
  that is the opening.
- Pricing splits into three models: **per active contact** (ManyChat/Chatfuel), **flat seat/inbox
  fee + pass-through message cost** (respond.io, SleekFlow, Wati/AiSensy/Interakt), and
  **per-channel/per-seat** (Buffer, Hootsuite, Sprout).
- **Compliance is a product feature, not a footnote.** Unofficial bulk senders (Chrome extensions,
  APK mods, WhatsApp group blasters) are detectable at the protocol level and get numbers
  permanently banned. Anything we build must be API-native and consent-first.

---

## 2. How this segment actually works (the mechanics)

This is the part that differs most from email, and it drives most of the feature list.

### 2.1 Meta — Instagram DM & Messenger

| Rule | Detail |
|---|---|
| **24-hour window** | You may message a user for 24h after *their* last interaction. Any inbound message resets it. |
| **What opens a window** | A DM, a **comment on your post** that triggers a DM automation, a **story reply**, a **story mention**. |
| **Human Agent tag** | Extends to **7 days** — but only for messages actually sent by a human. Sending automated messages under this tag is a policy violation and the API blocks it. |
| **Frequency cap** | No more than **1 automated DM per user per 24h** from comment or story triggers. |
| **Human handover** | Every automated experience must offer a clear path to a human agent. |
| **Outside the window** | Requires Recurring Notifications / Marketing Messages opt-in (Messenger), otherwise you cannot re-engage. |

**Implication:** the product must model a *permission window per contact per channel*, show it in
the UI, and block/queue sends that would violate it. That has no email equivalent.

### 2.2 WhatsApp Business Platform

| Rule | Detail |
|---|---|
| **Templates** | Marketing, Utility and Authentication conversations can *only* be opened with a pre-approved template. Service replies inside an open window are free-form. |
| **Per-message pricing** | Since **1 July 2025**, billing is per *delivered template message*, not per 24h conversation. |
| **Category rates** | Marketing is the most expensive and gets **no volume discount**. Utility/Authentication have volume tiers. Service messages inside the 24h window are free. |
| **Indicative rates** | Marketing ≈ $0.025 (US), ~$0.13–0.14 (DE/FR), ~$0.0118 (IN). Utility ≈ $0.004 (US). Auth ≈ $0.0014 (IN) to $0.05+ (EU). |
| **Opt-in** | Mandatory and auditable. Messaging non-opted-in contacts is the fastest route to a permanent ban. |
| **Quality rating** | Meta scores each number (green/yellow/red) and throttles messaging limits accordingly. |
| **CTWA bonus** | A conversation started from a Click-to-WhatsApp ad opens a **72-hour free marketing window**. |

### 2.3 Click-to-WhatsApp / Click-to-Message ads (CTWA)

Meta ads whose CTA opens a WhatsApp/Messenger/Instagram thread instead of a landing page. Meta's own
data claims ~92% lower cost per lead vs. a landing-page destination. Fastest-growing Meta Ads format
in LATAM, India, SEA, Southern Europe and MENA. Objectives supported: Engagement, Traffic, Sales,
Messages.

**Attribution problem:** the Meta Pixel cannot see conversions that happen inside WhatsApp. The fix
is the **Conversions API** with `action_source: "business_messaging"` and
`messaging_channel: "whatsapp"`. Without those two fields Meta can't attribute the conversion — so a
CTWA product needs a CAPI forwarder as a first-class feature.

### 2.4 Groups, Channels & Communities

This is where most of the market is grey, and where the user's question ("campaigns on Instagram
groups") lands.

| Surface | API status | What tools actually do |
|---|---|---|
| **WhatsApp Groups** | **No official Business API support** for broadcasting into groups. | Unofficial bulk senders / web automation. **Ban risk is severe and permanent.** |
| **WhatsApp Channels** | One-to-many broadcast, opt-in follower model. No public write API yet. | Manual posting; tools drive *joins* via CTAs on other channels. |
| **Instagram Broadcast Channels** | No third-party posting API (as of late 2025). | Manual posting workflow; tools handle growth/promotion into it. Reported ~10x engagement vs. main feed. |
| **Telegram Channels/Groups** | **Fully open Bot API.** | Real automation: scheduled channel posts, group moderation bots, broadcast, analytics (Combot, TGStat, Manybot, ControllerBot). |
| **Discord/Slack communities** | Open bot APIs. | Community campaign + announcement automation. |

**Product stance we should take:** support Telegram fully (open API), support WhatsApp/Instagram
Channels as *manual-assist + growth* surfaces, and **explicitly refuse** WhatsApp group blasting —
turn it into a "Communities" growth feature instead of a spam feature. Sell the compliance as a
differentiator.

### 2.5 TikTok

Official DM API exists (built on Login Kit v2), **Business accounts only**, **not available in
EEA / Switzerland / UK**. Text-only DMs universally supported. **Comment-triggered DM is not
supported by the official API** as of early 2026 — third-party tools that offer it are doing it
unofficially. Expect parity within 12–18 months.

### 2.6 RCS (Google)

2026 is the inflection point. Three commercial models: basic (SMS parity pricing), rich single
message (+20–40%), conversational session (~2x SMS but unlimited replies in a 6–24h window).
Requires verified sender agent registration and brand vetting. Reported ~45% response rate, 15–30%
CTR, 98% open rate.

---

## 3. Market size

| Market | 2026 | Forecast | CAGR |
|---|---|---|---|
| Conversational commerce | $12.6–14.5B | $22.6B (2031) / $39.5B (2034) | 12–13% |
| Conversational marketing software | ~$4–5B | $12.45B (2033) | 14% |
| CPaaS | $21.3–31.2B | $41B (2031) / $86.3B (2030) | 14–29% |

WhatsApp Business API alone carries **>100B messages/month**.

---

## 4. The six product archetypes

| # | Archetype | What it is | Representative vendors |
|---|---|---|---|
| 1 | **Chat-marketing / DM automation** | Visual flow builder over IG/Messenger/WhatsApp/TikTok DMs. Comment-to-DM is the hero feature. | **ManyChat**, Chatfuel, Inro, CreatorFlow, LinkDM, InstantDM, ReplyRush |
| 2 | **WhatsApp Business Solution Providers (BSPs)** | Broadcast campaigns, template management, team inbox, chatbot, commerce flows. Heavily India/SEA/LATAM. | **AiSensy**, Wati, Interakt, Gallabox, DoubleTick, Zoko, Spur, 360dialog, Gupshup |
| 3 | **Omnichannel messaging inbox** | One team inbox across WhatsApp/IG/Messenger/Telegram/TikTok/email/voice, with routing, SLAs, AI agents. | **respond.io**, SleekFlow, Trengo, Rasayel, Superchat |
| 4 | **Social media management (SMM)** | Publishing, calendar, approvals, social inbox, analytics, employee advocacy, link-in-bio. | **Hootsuite**, Sprout Social, Buffer, Later, Agorapulse, Sendible, Planable, Statusbrew, Vista Social, Metricool |
| 5 | **Social listening / moderation** | Brand monitoring, sentiment, share of voice; ad-comment moderation and auto-hide. | Brandwatch, Sprinklr, Meltwater, Brand24, YouScan, Pulsar, **NapoleonCat**, CommentGuard, Replient |
| 6 | **Influencer / UGC / affiliate** | Creator discovery, outreach, briefs, content rights, affiliate tracking, payouts. | Collabstr, Creator.co, JoinBrands, Archive, Grin, Sprout's influencer module |

Nobody spans all six. respond.io/SleekFlow own 3, ManyChat owns 1 (deeply), Sprout owns 4+5+part of
6. A campaign platform that already has email/CRM/commerce (i.e. ours) plausibly wins by adding
**1 + 2 + 3 + part of 4/5**.

---

## 5. Full feature inventory (extracted & categorised)

This is the taxonomy that drives the sidebar changes.

### A. Social accounts & connections
Account/page/IG-business connection · Meta Business/WABA onboarding (embedded signup) · phone number
registry · Telegram bot tokens · TikTok Business auth · token health & re-auth alerts · per-account
permission scopes · multi-brand / multi-workspace account grouping.

### B. Chat automation (the core)
**Triggers:** comment on post/Reel keyword · comment on *ad* / dark post · story reply · story
mention · DM keyword · welcome/first-DM · "no-match" fallback · ref-link / `m.me` / `ig.me` deep link
· QR code · scan-to-chat · website widget · CTWA ad entry · webhook/API trigger · re-engagement
timer.
**Logic:** visual drag-drop flow builder · conditions & branching · delays/waits · A/B split in flow
· randomiser · tags & custom fields · user input capture & validation · goals/conversion steps ·
jump-to-flow · loop/menu · subscription state.
**Actions:** send text/image/video/carousel/quick replies/buttons · public comment auto-reply ·
private DM reply · hide/delete comment · like comment · add/remove tag · set field · assign to agent
· HTTP request / webhook out · CRM update · add to sequence · notify team.
**AI:** AI reply step · AI agent with knowledge base · intent detection · sentiment · auto-summarise
thread · suggested replies · multilingual auto-translate · sandbox testing before go-live.
**Guardrails:** 24h-window awareness · 1-DM-per-24h cap · human-handover step · quiet hours ·
frequency capping · opt-out keyword handling.

### C. Broadcasts, sequences & campaigns
One-off broadcast to a segment · scheduled broadcast · recurring broadcast · drip sequences ·
timezone-aware send · send-time optimisation · throttling / drip-rate control · per-message cost
preview before send · budget cap per campaign · retry & fallback channel (WhatsApp → SMS → email) ·
campaign-level A/B · UTM stamping · short links with click tracking.

### D. Message templates & compliance (WhatsApp/RCS-specific)
Template composer (header/body/footer/buttons/variables) · category selection (Marketing / Utility /
Authentication) · submit-for-approval + status tracking · rejection reasons & resubmit · multi-language
template sets · variable sample values · template versioning · **opt-in ledger** (source, timestamp,
proof) · opt-out & STOP handling · quality rating monitor · messaging-limit tier tracker · number
health / ban-risk alerts · policy pre-send linter.

### E. Social publishing
Multi-network composer (IG, FB, TikTok, LinkedIn, X, Threads, Pinterest, YouTube, Google Business) ·
per-network preview & variant text · content calendar with drag-drop reschedule · queue/slots ·
bulk upload & CSV import · first comment · hashtag sets · alt text · geotag · product tagging ·
collaborator tags · Reels/Story/Carousel formats · evergreen recycling · best-time suggestions ·
draft → review → approve workflow (multi-tier, external client portal, lock after sign-off) ·
post-publish edit · link-in-bio page.

### F. Engagement / social inbox
Unified inbox across DMs + comments + mentions + reviews · organic **and** ad/dark-post comments ·
assignment, ownership & routing rules · SLA timers & escalation · internal notes & @mentions ·
canned/saved replies · snooze/resolve/tag · contact profile side panel with full cross-channel
history · sentiment tagging · bulk actions.

### G. Comment moderation
Keyword/regex block rules · link/URL blocking · AI spam / hate / profanity / negative-sentiment
detection · auto-hide, auto-delete, auto-reply · per-post and per-ad rule scoping · allowlist of
known-good commenters · competitor-mention detection · moderation audit log · turn comments off on
ads.

### H. Communities, groups & channels
WhatsApp Channel management & follower growth · Instagram Broadcast Channel workflow (manual-assist,
scheduling reminders, growth CTAs) · Telegram channel scheduled posting · Telegram group moderation
& welcome bots · Discord/Slack announcement automation · member growth analytics · join-link
campaigns & attribution.

### I. Social ads
Campaign/ad-set/ad management from inside the tool · **Click-to-Message ad builder** (WhatsApp,
Messenger, Instagram) · ad-to-flow mapping (which flow answers which ad) · Lead Ads / Instant Forms
with conditional logic + real-time CRM sync via Leads Webhook · custom & lookalike audience sync
from segments · retargeting from chat behaviour · **Conversions API forwarder** (with
`business_messaging` source) · creative library · automated rules (pause ad set over CPL threshold) ·
boost-post automation · ad-comment routing into the social inbox.

### J. Social commerce
Product catalogue sync to WhatsApp/IG Shopping · in-chat cart & checkout · payment links · order
confirmation & shipping updates · **COD confirmation and COD→prepaid conversion** · abandoned-cart
recovery over WhatsApp/DM · post-purchase review request · re-order nudges · fraud/RTO scoring.
*(Our existing Commerce group covers the email half of this; the chat half is missing.)*

### K. Creators, influencers & UGC
Creator discovery & audience analysis · outreach sequences · brief/contract management · deliverable
tracking · UGC collection & rights/whitelisting · content library · affiliate/discount code
attribution · payouts · creator performance leaderboards.

### L. Listening & analytics
Keyword/brand/competitor monitoring queries · sentiment & share of voice · trend/topic detection ·
crisis alerts · historical archive · per-network engagement analytics · follower growth · story &
Reel metrics · best-performing content · **conversation funnel analytics** (comment → DM → reply →
conversion) · flow step drop-off · per-template performance · cost-per-conversation & cost-per-lead ·
agent productivity / response-time reports · competitor benchmarking.

### M. Team & governance
Roles & granular permissions per channel · approval chains · brand safety guardrails · audit log ·
seat management · client/brand workspaces (agency mode) · white-label.

---

## 6. Pricing survey

### 6.1 Chat marketing / DM automation

| Product | Entry | Mid | Top | Model | Notes |
|---|---|---|---|---|---|
| **ManyChat** | Free (25 contacts, 2 channels) | Pro **$29/mo** | Business $69 / Advanced $139 (25k contacts) | Per **active contact** | Essential $14. March 2026 overhaul cut free tier from 1,000 → 25 contacts. Cost scales with campaign *success*, which is the main complaint. |
| **Chatfuel** | Free (25 contacts) | Pro $29 | Business $69 (500 contacts) | Per active contact | +$29/mo AI add-on. Reported 2–6x pricier than ManyChat at equivalent tiers. |
| **Inro** | Free (100 contacts) | from €12.99/mo | — | Per contact | Instagram-only, AI-first. |
| **LinkDM** | Free (1,000 DMs) | **$19/mo flat** | — | Flat | |
| **InstantDM** | — | **$9.99/mo unlimited** | — | Flat | Aggressive low-end price anchor. |
| **CreatorFlow** | Free (500 DMs, all features) | flat-rate | — | Flat | Instagram-only. |
| **ReplyRush** | Free (1,500 DMs/mo) | — | — | Freemium | |

> Sources disagree on ManyChat's free-tier contact limit (25 vs 1,000) — the 25-contact figure is
> attributed to a March 2026 change and appears in the more recent write-ups.

### 6.2 WhatsApp BSPs (India-centric pricing, where the volume is)

| Product | Platform fee | Positioning |
|---|---|---|
| **AiSensy** | from **₹999–1,500/mo**, Pro ₹3,200 | Lowest platform fee; volume-broadcast specialist; native CTWA + Meta Ads Manager integration; built-in chatbot builder |
| **Interakt** | from **₹2,142/mo** | Haptik/Reliance Jio sub-brand; deepest Shopify integration (abandoned cart, order updates, review requests, COD confirmation); active-contact tiers |
| **Wati** | from **₹2,499/mo** | Most CRM-integrated (Zoho, HubSpot, Salesforce, Shopify, WooCommerce, Razorpay); 8,000+ businesses; often adds Meta markup |
| **Zoko** | quote | Commerce-first WhatsApp CRM; catalogue sync, in-chat order collection, COD flows; rule-based (weak AI), WhatsApp-only |

**Critical:** all of these sit *on top of* Meta's per-message fees. Reported pattern — "hidden fees
turn a $60 quote into a $185 bill." A **cost-transparency / message-spend dashboard is a real
differentiator**, not a nice-to-have.

### 6.3 Omnichannel inboxes

| Product | Entry | Typical | Notes |
|---|---|---|---|
| **respond.io** | $79/mo | ~$159/mo | No BSP markup on top of subscription. WhatsApp, TikTok, IG, FB, Telegram, Viber, WeChat, SMS, LINE, email, VoIP. AI Agents can route, update lifecycle, trigger automation. |
| **SleekFlow** | Free plan | Pro **$199/mo**, Premium $349 | Commerce-focused (catalogues, payment links). AI sandbox testing before deploy. |
| **Trengo** | quote | — | EU SMB focus; claims AI agent resolves ~80% of repetitive conversations; 70+ languages. |

### 6.4 Social media management

| Product | Price | Notes |
|---|---|---|
| **Buffer** | Free (3 accounts, 10 posts) · **$5–6/channel/mo** | Best value for solo/small |
| **Hootsuite** | from **$19/mo** | Widest feature set, enterprise compliance & approvals; price has crept up |
| **Later** | Starter **$25/mo** (1 social set) | |
| **Agorapulse** | **$79/mo** | Agency sweet spot |
| **Sprout Social** | **$199–249/seat/mo**, Advanced **$399/seat/mo** | $2,400–6,000/yr per seat before add-ons. Best analytics + inbox. 9M+ creator index. |

### 6.5 Listening & influencer

| Segment | Range |
|---|---|
| Social listening | **$29/mo** (Awario) → **$199–999/mo** (Brand24) → **$20k–100k+/yr** (Brandwatch, Sprinklr, Meltwater); Sprinklr Enterprise $150k+/yr |
| Influencer/UGC | **$200–2,000+/mo** subscription, or pay-per-collaboration. JoinBrands from $99/mo; Creator.co self-serve $500/mo, managed $1,800/mo |

### 6.6 Pricing-model takeaway

| Model | Used by | Pros | Cons |
|---|---|---|---|
| Per active contact | ManyChat, Chatfuel, Interakt | Aligns with value | **Punishes success** — a viral Reel blows the tier in a day. Most-cited complaint in the category. |
| Flat platform fee + pass-through message cost | AiSensy, respond.io, Wati | Predictable, scales | Requires cost-transparency tooling or users feel gouged |
| Per channel / per seat | Buffer, Sprout, Hootsuite | Simple | Expensive for multi-brand/agency |

For Geiger Campaign, **flat platform fee + transparent pass-through** fits the existing email/SMS
model best and is the most defensible against the incumbents' biggest weakness.

---

## 7. Compliance & risk (must be designed in, not bolted on)

1. **Never build or integrate an unofficial WhatsApp sender.** Chrome extensions, APK mods and
   unofficial bulk senders are detectable at the protocol level; the outcome is a **permanent ban,
   not a warning**, and Meta rarely approves appeals. The number, chat history and contact list are
   lost.
2. **Consent is the gate.** Messaging non-opted-in contacts is the single fastest path to a ban. We
   need an opt-in ledger with source + timestamp + proof, per channel.
3. **Volume ramping matters.** Going from 10 msg/day to 500 in one afternoon reads as a compromised
   account. Warm-up/ramp scheduling is a real feature (we already have IP Warmup for email — the
   same idea applies to WhatsApp numbers).
4. **The 24h window and the 1-DM-per-24h cap must be enforced by the product**, not left to the
   user. Show the window, block the send, queue it.
5. **Human handover is mandatory** in any automated Meta experience.
6. **WhatsApp group blasting**: decline it. Offer Communities/Channels growth instead.

---

## 8. Gap analysis vs. current Geiger Campaign nav

| Feature area | Current state | Verdict |
|---|---|---|
| Email campaigns, templates, deliverability | Strong (Campaigns, Deliverability, Transactional) | Keep |
| Audience, segments, scoring, suppression | Strong | Reusable for chat channels as-is |
| Automations (Workflows/Journeys/Triggers) | Exists, but triggers are email/web events | **Needs social triggers** — comment, story reply, mention, DM keyword, ad click |
| Channels | Email, SMS, WhatsApp, Push, In-App | **Missing Instagram, Messenger, Telegram, TikTok, RCS** |
| WhatsApp | One stub screen | **Missing everything that makes WhatsApp work**: templates, opt-in, quality rating, broadcast, cost |
| Inbox | Conversations, SMS, WhatsApp, Live Chat | **Missing Instagram/Messenger DMs, comments, assignment & SLA** |
| Comment-to-DM | **Absent** | The category's hero feature |
| Social publishing | **Absent** | — |
| Comment moderation | **Absent** | — |
| Social listening/analytics | **Absent** | — |
| Communities/groups/channels | **Absent** | — |
| Social ads / CTWA / Lead Ads / CAPI | **Absent** | Biggest revenue-adjacent gap |
| Creators/UGC/affiliate | **Absent** | Optional, phase 2 |
| Chat commerce (COD, in-chat cart) | Commerce group is email-only | Extend later |

---

## 9. Proposed sidebar taxonomy

Six new groups plus targeted extensions to three existing ones. Titles map 1:1 to
`SCREEN_REGISTRY` keys in `components/internal/screens/screen_registry.js`; unregistered titles fall
back to `PlaceholderScreen`, so the nav can land before the screens do.

### New groups

| Group | Sub-items | Covers §5 categories |
|---|---|---|
| **Social** | Accounts, Publishing, Post Composer, Calendar (social), Comments, Moderation Rules, Listening, Social Analytics, Link in Bio | A, E, F, G, L |
| **Chat Automation** | Comment-to-DM, Keyword Triggers, Story & Mentions, DM Flows, Sequences, AI Agent, Entry Points, Handover Rules | B |
| **Broadcasts** | Broadcast Campaigns, Message Templates, Opt-In & Consent, Sender Registry, Quality & Limits, Message Costs | C, D |
| **Communities** | WhatsApp Channels, Instagram Broadcasts, Telegram Channels, Groups, Member Growth | H |
| **Ads** | Ad Campaigns, Click-to-Message, Lead Ads, Audience Sync, Conversions API, Creative Library, Ad Comments | I |
| **Creators** | Creator Discovery, Outreach, Collaborations, UGC Library, Affiliate Links, Payouts | K |

### Extensions to existing groups

| Group | Added |
|---|---|
| **Channels** | Instagram, Messenger, Telegram, TikTok, RCS |
| **Inbox** | Instagram DM, Messenger, Comment Inbox, Assignments |
| **Automations** | Social Triggers |

Chat-commerce (COD confirmation, in-chat cart) is deliberately **not** given its own group — it
belongs as future sub-items under the existing **Commerce** group, since it shares the catalogue,
orders and abandoned-cart entities already modelled there.

---

## 10. Build-order recommendation

1. **Channels: Instagram + Messenger** + **Chat Automation: Comment-to-DM / Keyword Triggers** —
   the hero loop, and the cheapest thing to make demo well.
2. **Inbox: Instagram DM / Comment Inbox** + assignment — makes #1 usable by a team.
3. **Broadcasts: Message Templates + Opt-In & Consent + Quality & Limits** — unlocks WhatsApp for
   real, and the compliance angle is the differentiator.
4. **Ads: Click-to-Message + Conversions API** — the revenue story; also where the existing
   Attribution screen gets its social half.
5. **Social: Publishing + Comments + Moderation Rules** — table stakes vs. Hootsuite/Sprout.
6. **Communities**, then **Creators** — phase 2.

---

## Sources

**Chat marketing / DM automation**
- [ManyChat Pricing 2026: Plans, WhatsApp Fees & Real Cost — Flowgent](https://flowgent.ai/blog/manychat-pricing)
- [ManyChat Pricing Breakdown 2026 — InstantDM](https://instantdm.com/blog/manychat-pricing-2026)
- [Instagram DM Automation Tool: 12 Best Tools Compared (2026) — Flowgent](https://flowgent.ai/blog/instagram-dm-automation-tool)
- [Best Instagram Automation Tools 2026 — Inrō](https://www.inro.social/blog/top-instagram-automation-tools-engagement-dm-features-2026)
- [Best Instagram DM Automation Tools 2026 — CreatorFlow](https://creatorflow.so/blog/best-instagram-dm-automation-tools/)
- [ManyChat vs Chatfuel 2026 — Flowgent](https://flowgent.ai/blog/manychat-vs-chatfuel)
- [Manychat vs Chatfuel 2026 — Chatimize](https://chatimize.com/manychat-vs-chatfuel/)
- [Every Growth Tool Explained — Manychat](https://manychat.com/blog/growth-tools/)
- [What Is ManyChat? Features, Pricing & How It Works (2026) — BotPenguin](https://botpenguin.com/blogs/manychat-guide)

**Platform rules & APIs**
- [Instagram Messaging API 24-Hour Window Policy (2026) — KeyAPI](https://www.keyapi.ai/blog/instagram-messaging-api-policy/)
- [Instagram DM Automation Rules: Full Guide (2026) — Spur](https://www.spurnow.com/en/blogs/instagram-dm-automation-rules)
- [Instagram DM Compliance 2026: Meta's Allowed vs Banned — CreatorFlow](https://creatorflow.so/blog/instagram-dm-compliance-meta-rules/)
- [Sending outside the 24-hour and 7-day windows — Manychat Help](https://help.manychat.com/hc/en-us/articles/14281199732892-How-to-send-messages-outside-the-24-hour-and-7-day-windows-in-Messenger-and-Instagram)
- [TikTok DM Automations — Vista Social](https://support.vistasocial.com/hc/en-us/articles/38477260668187-TikTok-DM-Automations)
- [How to Set Up TikTok DM Automation (2026) — ChattyFlow](https://www.chattyflow.com/guides/tiktok-dm-automation-setup)

**WhatsApp pricing, BSPs & compliance**
- [WhatsApp Business API Pricing 2026: Per-Message Rates — SetSmart](https://setsmart.io/blog/whatsapp-business-api-pricing)
- [WhatsApp Business API Pricing 2026 — Uptail](https://www.uptail.ai/blog/whatsapp-business-api-pricing-2026-what-it-costs-and-how-billing-works)
- [WhatsApp Marketing Message Pricing in 2026 — Blueticks](https://blueticks.co/blog/whatsapp-business-pricing-marketing-messages-2026)
- [AiSensy vs Interakt vs Wati: 2026 Comparison](https://aisensy.com/aisensy-vs-interakt-vs-wati)
- [AiSensy vs WATI vs Interakt — 2026 Pricing Showdown — Go4WhatsUp](https://www.go4whatsup.com/blog/aisensy-vs-wati-vs-interakt-pricing-showdown-2026/)
- [WhatsApp API Pricing India 2026 — Codingclave](https://codingclave.com/guides/whatsapp-api-pricing-india-2026-comparison)
- [Will WhatsApp Ban My Number for Marketing? Rules (2026) — Eazybe](https://eazybe.com/blog/will-whatsapp-ban-my-number-for-marketing)
- [WhatsApp Bulk Messaging Legal vs Illegal Methods — Connverz](https://www.connverz.com/blog/whatsapp-bulk-messaging-legal-vs-illegal-methods)
- [WhatsApp Spam Policy Explained for Businesses in 2026 — Whatsable](https://www.whatsable.app/blog/whatsapp-spam-policy-explained-for-businesses-in-2026)
- [Zoko Review (2026) — respond.io](https://respond.io/blog/zoko-review)

**Omnichannel inboxes**
- [SleekFlow vs respond.io: which scales better in 2026 — respond.io](https://respond.io/blog/sleekflow-vs-respondio)
- [Multichannel Communication: 6 Platforms Compared (2026) — respond.io](https://respond.io/blog/multichannel-communication)
- [Best Respond.io Alternatives 2026 — Rework](https://resources.rework.com/tools/chat-messaging/best-respondio-alternatives)

**Ads, CTWA & lead ads**
- [Click-to-WhatsApp Ads (CTWA): 2026 guide — AsisteClick](https://asisteclick.com/en/blog/click-to-whatsapp-ads-ctwa-conversion-2026/)
- [Click to WhatsApp Ads: The 2026 Conversion Guide — Spur](https://www.spurnow.com/en/blogs/click-to-whatsapp-ads)
- [Meta Click-to-WhatsApp Ads: Complete 2026 Setup Guide — AdLibrary](https://adlibrary.com/posts/meta-click-to-whatsapp-ads-guide)
- [Meta Lead Ads Guide 2026: Setup, Optimization, CRM Integration — AdLibrary](https://adlibrary.com/posts/meta-lead-ads-guide-2026)
- [Meta Lead Ads: Complete Guide 2026 — Benly](https://benly.ai/learn/meta-ads/lead-generation-ads)

**Social publishing, moderation & listening**
- [Social Media Management Pricing Comparison 2026 — SaaSPricePulse](https://www.saaspricepulse.com/blog/social-media-management-pricing-comparison-2026)
- [The 10 best social media management tools in 2026 — Zapier](https://zapier.com/blog/best-social-media-management-tools/)
- [21 Best Social Media Scheduling Tools in 2026 — Sprout Social](https://sproutsocial.com/insights/social-media-scheduling-tools/)
- [Instagram Comment Moderation Tool — NapoleonCat](https://napoleoncat.com/uses/instagram-comment-moderation-tool/)
- [Facebook Ads Comment Moderation — NapoleonCat](https://napoleoncat.com/uses/facebook-ads-comment-moderation/)
- [Best 6 Social Media Comment Moderation Tools In 2026 — Statusbrew](https://statusbrew.com/insights/social-media-comment-moderation-tools)
- [9 Best Social Listening Tools for 2026 — Pulsar](https://www.pulsarplatform.com/compare/best-social-listening-tools-2026-independent-comparison)
- [12 Best Social Listening Tools Compared for 2026 — Brandwatch](https://www.brandwatch.com/blog/social-listening-tools/)
- [Why employee advocacy matters in 2026 — Hootsuite](https://blog.hootsuite.com/employee-advocacy/)

**Communities, channels & Telegram**
- [How to Create and Use Instagram Broadcast Channel in 2026 — Sendible](https://www.sendible.com/insights/instagram-broadcast-channels)
- [Guide to Instagram Broadcast Channels For Business (2026) — Spur](https://www.spurnow.com/en/blogs/instagram-broadcast-channels-for-business)
- [WhatsApp Channels: Complete Brand Broadcast Feature Guide — Hashmeta](https://hashmeta.com/blog/whatsapp-channels-complete-brand-broadcast-feature-guide-for-marketing-success/)
- [Telegram Marketing in 2026: Full Guide — Brand24](https://brand24.com/blog/telegram-marketing-guide/)
- [4 Best Telegram Chatbots for Business in 2026 — Chatimize](https://chatimize.com/best-telegram-bots/)

**RCS, influencer & market size**
- [RCS Business Messaging: The Complete Guide for 2026 — DailyStory](https://www.dailystory.com/blog/rcs-business-messaging-the-complete-guide-for-2026/)
- [RCS Business Messaging Pricing — Telnyx](https://telnyx.com/resources/rcs-business-messaging-pricing)
- [Best UGC & Influencer Marketing Platforms (2026) — Pixis](https://pixis.ai/blog/best-ugc-influencer-marketing-platforms-2026/)
- [Top Influencer Marketing Platforms for Brands (2026) — Influencer Marketing Hub](https://influencermarketinghub.com/top-influencer-marketing-platforms/)
- [Conversational Commerce Market Size & Trends — Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/conversational-commerce-market)
- [CPaaS Market Report 2025-2030 — Grand View Research](https://www.grandviewresearch.com/industry-analysis/communication-platform-as-a-service-market-report)
