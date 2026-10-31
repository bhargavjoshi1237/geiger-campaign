// Communities: Halcyon's Telegram channels and groups (run by the studio bot, connection 8), the WhatsApp
// Channels and Instagram broadcast channels it plans by hand for clients, the join links it spreads in
// emails / QR codes / link-in-bio, and the follower history the Member Growth screen charts.

import { PROJECT_ID, between, daysAgo, daysFromNow, hoursAgo, noise, pick, seedIds } from "./helpers.js";
import { personId } from "../cast.js";

const aid = seedIds({
  community_channel: 1901,
  community_post: 1902,
  community_group: 1903,
  group_rule: 1904,
  community_group_event: 1905,
  join_link: 1906,
  member_snapshot: 1907,
});

const TELEGRAM_BOT = aid("connection", 8);
const DAY = 24 * 60 * 60 * 1000;

// Base columns for this area's own kinds (helpers' base() only knows the core kinds).
function own(kind, n, { created = 30, updated } = {}) {
  return {
    id: aid(kind, n),
    project_id: PROJECT_ID,
    created_at: daysAgo(created),
    updated_at: daysAgo(updated ?? Math.max(0, created - 1)),
  };
}

// n, platform, name, handle, invite, current followers, followers 90 days ago, created days ago, assignee person.
const CHANNELS = [
  { n: 1, platform: "telegram_channel", name: "Halcyon Dispatch", handle: "halcyondispatch", chat: "-1001874402211", now: 4820, then: 3610, created: 140 },
  { n: 2, platform: "telegram_channel", name: "Kestrel Riders", handle: "kestrelriders", chat: "-1002093317745", now: 2140, then: 620, created: 95 },
  { n: 3, platform: "telegram_group", name: "Halcyon Creative Summit", handle: "halcyonsummit", chat: "-1001990236518", now: 864, then: 410, created: 100 },
  { n: 4, platform: "telegram_group", name: "Kestrel Aero Owners", handle: "", chat: "-1002217760431", invite: "https://t.me/+Kx7AeroOwners2Q", now: 312, then: 96, created: 92 },
  { n: 5, platform: "whatsapp_channel", name: "Atlas Coffee Roasters", invite: "https://whatsapp.com/channel/0029VaAtlasCoffeeRoast01", now: 6410, then: 4980, created: 150, assignee: 10, lead: 15 },
  { n: 6, platform: "whatsapp_channel", name: "Solace Hotels", invite: "https://whatsapp.com/channel/0029VbSolaceHotelsSummer26", now: 3150, then: 1720, created: 110, assignee: 6, lead: 60 },
  { n: 7, platform: "instagram_broadcast", name: "Halcyon behind the scenes", invite: "https://ig.me/j/AbHalcyonBTSstudio", now: 1984, then: 1310, created: 130, assignee: 7, lead: 15 },
  { n: 8, platform: "instagram_broadcast", name: "Kestrel insiders", invite: "https://ig.me/j/AbKestrelInsiders", now: 1236, then: 280, created: 92, assignee: 5, lead: 0 },
];

const TG_RIGHTS = (group) => ({
  isAdmin: true,
  status: "administrator",
  canPost: true,
  canDelete: true,
  canRestrict: group,
  canInvite: true,
  canEdit: !group,
  checkedAt: daysAgo(1),
});

function channelRows() {
  const rows = CHANNELS.map((c) => {
    const telegram = c.platform.startsWith("telegram");
    return {
      ...own("community_channel", c.n, { created: c.created, updated: 1 }),
      platform: c.platform,
      connection_id: telegram ? TELEGRAM_BOT : null,
      external_chat_id: telegram ? c.chat : null,
      name: c.name,
      handle: c.handle || "",
      invite_url: c.invite || (c.handle ? `https://t.me/${c.handle}` : ""),
      follower_count: c.now,
      status: "active",
      settings: telegram
        ? { rights: TG_RIGHTS(c.platform === "telegram_group"), defaults: { parseMode: "HTML", silent: false, protectContent: false, disablePreview: false } }
        : { assigneeId: personId(c.assignee), reminderLeadMinutes: c.lead },
      last_synced_at: telegram ? hoursAgo(3) : null,
      metadata: {},
      created_by: personId(c.platform === "instagram_broadcast" ? 7 : 10),
      deleted_at: null,
    };
  });
  // A channel the bot was added to in Telegram that nobody has linked yet (the "detected chats" list).
  rows.push({
    ...own("community_channel", 9, { created: 2, updated: 2 }),
    platform: "telegram_channel",
    connection_id: TELEGRAM_BOT,
    external_chat_id: "-1002301148890",
    name: "Orbit Audio Announcements",
    handle: "orbitaudio",
    invite_url: "https://t.me/orbitaudio",
    follower_count: 0,
    status: "pending",
    settings: { rights: TG_RIGHTS(false) },
    last_synced_at: null,
    metadata: {},
    created_by: null,
    deleted_at: null,
  });
  return rows;
}

// Daily snapshots for Telegram (synced by the worker), weekly hand-entered counts for WhatsApp / Instagram.
function snapshotRows() {
  const rows = [];
  let n = 0;
  for (const c of CHANNELS) {
    const telegram = c.platform.startsWith("telegram");
    const span = Math.min(90, c.created - 1);
    const step = telegram ? 1 : 7;
    const start = c.then + Math.round(((c.now - c.then) * (90 - span)) / 90);
    for (let day = span; day >= 0; day -= step) {
      const progress = (span - day) / span;
      // Ease-in growth with a little day-to-day wobble; the latest snapshot equals the channel's count.
      const trend = start + (c.now - start) * (0.55 * progress + 0.45 * progress * progress);
      const wobble = day === 0 ? 0 : Math.round((noise(c.n * 1000 + day) - 0.5) * (c.now * 0.008));
      n += 1;
      rows.push({
        id: aid("member_snapshot", n),
        project_id: PROJECT_ID,
        channel_id: aid("community_channel", c.n),
        count: Math.max(0, Math.round(trend) + wobble),
        captured_at: daysAgo(day, telegram ? 3 : 0),
        source: telegram ? "telegram_api" : "manual",
        note: !telegram && day === 0 ? "From the channel's info screen" : "",
        metadata: {},
        created_by: telegram ? null : personId(c.assignee),
        created_at: daysAgo(day, telegram ? 3 : 0),
        updated_at: daysAgo(day, telegram ? 3 : 0),
        deleted_at: null,
      });
    }
  }
  return rows;
}

const POSTS = {
  1: [
    { body: "New in the studio: our Atlas Coffee identity is live across 14 cafés. Case study, packaging system and the type we drew for it.", media: "atlas-case-study.jpg", button: ["Read the case study", "https://halcyon.studio/work/atlas"], days: 3, views: 3920, reactions: 214 },
    { body: "Halcyon Creative Summit tickets: the early rate ends Friday. Two days in Lisbon, 22 speakers, one very long lunch.", button: ["Get a ticket", "https://halcyon.studio/summit"], days: 8, views: 3610, reactions: 162 },
    { body: "We're hiring a senior motion designer in Lisbon. Kenji's team, real briefs, no spec work.", button: ["See the role", "https://halcyon.studio/jobs/motion"], days: 13, views: 4105, reactions: 301 },
    { body: "Field notes from the Solace Summer '26 shoot in Barcelona — 12 hotels, 9 days, one drone that refused to fly.", media: "solace-field-notes.jpg", days: 18, views: 3380, reactions: 188 },
    { body: "Our 2026 brand trends report is out. Free, no email gate. Fewer gradients, more typography.", button: ["Download the report", "https://halcyon.studio/trends-2026"], days: 24, views: 4488, reactions: 356 },
    { body: "Studio playlist for October is up. 41 tracks the design team argued about for a week.", days: 31, views: 2950, reactions: 143 },
    { body: "Kestrel Aero: the brand film is done. Premiere at the launch event next month — Dispatch subscribers get the first look here.", media: "kestrel-aero-still.jpg", days: 38, views: 3770, reactions: 279 },
    { body: "Open studio night in Brooklyn, Thursday 7pm. Drinks, portfolio reviews, and the Orbit Audio listening room.", button: ["RSVP", "https://halcyon.studio/open-studio"], days: 46, views: 3105, reactions: 120 },
    { body: "Behind the Meridian Bank statement redesign: why we cut 40% of the page and support calls went down.", days: 55, views: 2840, reactions: 97 },
    { body: "Welcome to Halcyon Dispatch — studio news, launches and the occasional playlist. One or two posts a week, never more.", days: 70, views: 2210, reactions: 88 },
  ],
  2: [
    { body: "T-minus 30 days. Kestrel Aero pre-orders open to this channel 24 hours before anyone else.", media: "aero-teaser.mp4", type: "video", days: 2, views: 1980, reactions: 241 },
    { body: "Spec sheet, first look: 21 kg, 120 km range, belt drive, and the frame colours you voted for.", button: ["Full specs", "https://kestrelbikes.example/aero/specs"], days: 9, views: 1720, reactions: 188 },
    { body: "Test-ride weekend in Amsterdam: 4–5 April. 60 slots, first come first served.", button: ["Book a ride", "https://kestrelbikes.example/aero/test-ride"], days: 17, views: 1405, reactions: 132 },
    { body: "Poll result: Fjord Blue won by 312 votes. It's going into production.", days: 26, views: 1210, reactions: 166 },
    { body: "Why we moved the battery into the down tube — a short thread from Pieter and the engineering team.", days: 41, views: 940, reactions: 71 },
    { body: "Welcome, riders. This is where Kestrel Aero news lands first.", days: 60, views: 610, reactions: 45 },
  ],
  5: [
    { body: "This week's single origin: Huila, Colombia. Red apple, panela, a long cocoa finish. On every bar from Monday.", media: "huila-bag.jpg", days: 4, views: 4210, reactions: 312 },
    { body: "Our new Alfama café opens Saturday at 8am. First 100 flat whites are on us.", days: 11, views: 5120, reactions: 488 },
    { body: "Brew guide: the 1:16 V60 our baristas use for light roasts. Save this one.", media: "v60-guide.jpg", days: 19, views: 3880, reactions: 260 },
    { body: "The holiday blend is back — and so is the tin. Pre-orders open to channel followers first.", days: 27, views: 4470, reactions: 341 },
    { body: "Meet Diogo, our head roaster, and the 1968 Probat he restored by hand.", days: 36, views: 3610, reactions: 205 },
    { body: "Atlas loyalty cards are now in the app. Your paper stamps carry over.", days: 48, views: 3305, reactions: 151 },
  ],
  6: [
    { body: "Summer '26 is open for booking across all 12 Solace hotels. Channel followers get 15% off with code CHANNEL15.", media: "solace-summer.jpg", days: 6, views: 2410, reactions: 190 },
    { body: "New rooftop at Solace Barcelona: sunset sessions every Friday from June.", days: 16, views: 2105, reactions: 144 },
    { body: "Behind the scenes of our summer campaign shoot — 9 days, 12 hotels.", days: 29, views: 1690, reactions: 98 },
    { body: "Welcome to the Solace Hotels channel. Offers, openings and the odd postcard.", days: 58, views: 1180, reactions: 64 },
  ],
  7: [
    { body: "Moodboard Monday: the Kestrel Aero colour story, from swatch to frame.", media: "aero-moodboard.jpg", days: 5, views: 1460, reactions: 132 },
    { body: "Voice note from Jonas on why the Atlas wordmark has no straight lines.", days: 12, views: 1290, reactions: 101 },
    { body: "Studio poll: which Summit poster goes to print?", days: 20, views: 1510, reactions: 244 },
    { body: "First look at the Orbit Audio packaging prototypes.", media: "orbit-proto.jpg", days: 33, views: 1105, reactions: 87 },
    { body: "Welcome to behind the scenes — sketches, drafts and the work in between.", days: 64, views: 820, reactions: 58 },
  ],
  8: [
    { body: "Insiders first: Kestrel Aero pre-orders open here 48 hours early.", days: 7, views: 980, reactions: 121 },
    { body: "Fjord Blue in the wild — test frames from the Amsterdam workshop.", media: "fjord-blue.jpg", days: 21, views: 760, reactions: 94 },
    { body: "Welcome, insiders. Early access, test rides and launch news.", days: 50, views: 410, reactions: 33 },
  ],
};

// Upcoming / unfinished work per channel: [days from now (negative = past), status, body, extra].
const UPCOMING = {
  1: [
    [1, "scheduled", "Summit speaker announcement #3: Lucía Ferrer on designing hotels people come back to.", { button: ["See the lineup", "https://halcyon.studio/summit/speakers"] }],
    [4, "scheduled", "Kestrel Aero brand film premiere — watch it here first, 7pm Lisbon time.", { media: "kestrel-aero-film.mp4", type: "video" }],
    [null, "draft", "Year in review: 2026 at Halcyon in 12 projects.", {}],
    [-2, "failed", "Atlas Coffee café opening photo set.", { media: "atlas-alfama-opening.jpg", error: "Telegram couldn't download the media. Use a public HTTPS URL to an image or video." }],
  ],
  2: [
    [2, "scheduled", "Pre-orders open tomorrow at 9am CET for Kestrel Riders. Set a reminder.", { button: ["Pre-order page", "https://kestrelbikes.example/aero"] }],
    [3, "scheduled", "Pre-orders are open. 500 founders' edition frames, numbered.", { button: ["Pre-order now", "https://kestrelbikes.example/aero/preorder"] }],
  ],
  5: [
    [-0.1, "reminder_sent", "Saturday cupping at the Chiado roastery, 10am. Free, 20 seats — reply in the café to save one.", { media: "cupping-flyer.jpg" }],
    [2, "scheduled", "New: oat cortado on every bar. Same price as dairy, always.", {}],
    [6, "scheduled", "Holiday blend tins are back in cafés. Channel followers get them first on Friday.", { media: "holiday-tin.jpg" }],
    [null, "draft", "Origin trip diary: Huila, part one.", {}],
  ],
  6: [[3, "scheduled", "Last rooms for the Solace Lisbon jazz weekend. Followers book with CHANNEL15 until Sunday.", {}]],
  7: [
    [-0.2, "reminder_sent", "Summit poster vote results are in — the winner goes to print Monday.", { media: "summit-poster-final.jpg" }],
    [1, "scheduled", "Studio tour: the new Lisbon print room, in 6 photos.", { media: "print-room.jpg" }],
  ],
  8: [[2, "scheduled", "Insiders: test-ride slots for Amsterdam open in 24 hours.", {}]],
};

function mediaItem(name, type = "photo") {
  return [{ url: `https://assets.halcyon.studio/communities/${name}`, type, name }];
}

function postRows() {
  const rows = [];
  let n = 0;
  for (const c of CHANNELS) {
    const telegram = c.platform.startsWith("telegram");
    const mode = telegram ? "automated" : "manual_assist";
    for (const p of POSTS[c.n] || []) {
      n += 1;
      const at = daysAgo(p.days, between(n, 1, 9));
      rows.push({
        ...own("community_post", n, { created: p.days + 2, updated: p.days }),
        channel_id: aid("community_channel", c.n),
        body: p.body,
        media: p.media ? mediaItem(p.media, p.type) : [],
        buttons: p.button ? [{ text: p.button[0], url: p.button[1] }] : [],
        options: telegram ? { parseMode: "none" } : {},
        status: "posted",
        mode,
        scheduled_at: at,
        posted_at: at,
        external_message_id: telegram ? String(400 + n) : null,
        assignee_id: telegram ? null : personId(c.assignee),
        views: p.views,
        reactions: p.reactions,
        error: null,
        reminder_sent_at: telegram ? null : at,
        claimed_at: null,
        metadata: telegram ? {} : { postUrl: c.invite },
        created_by: personId(telegram ? 10 : c.assignee),
        deleted_at: null,
      });
    }
    for (const [when, status, body, extra] of UPCOMING[c.n] || []) {
      n += 1;
      const scheduled = when == null ? null : when < 0 ? hoursAgo(-when * 24) : daysFromNow(when, between(n, 1, 6));
      rows.push({
        ...own("community_post", n, { created: 3, updated: 1 }),
        channel_id: aid("community_channel", c.n),
        body,
        media: extra.media ? mediaItem(extra.media, extra.type) : [],
        buttons: extra.button ? [{ text: extra.button[0], url: extra.button[1] }] : [],
        options: telegram ? { parseMode: "none" } : {},
        status,
        mode,
        scheduled_at: scheduled,
        posted_at: null,
        external_message_id: null,
        assignee_id: telegram ? null : personId(c.assignee),
        views: 0,
        reactions: 0,
        error: extra.error || null,
        reminder_sent_at: status === "reminder_sent" ? scheduled : null,
        claimed_at: null,
        metadata:
          status === "reminder_sent"
            ? { reminder: { assigneeId: personId(c.assignee), inApp: true, email: "sent", error: null, at: scheduled } }
            : {},
        created_by: personId(telegram ? 10 : c.assignee),
        deleted_at: null,
      });
    }
  }
  return rows;
}

const GROUPS = [
  {
    n: 1,
    channel: 3,
    welcome: true,
    text: "Welcome to the Halcyon Creative Summit group, {first_name}! Schedules, venue updates and speaker Q&A live here. Please keep it friendly and on topic.",
    buttons: [{ text: "Summit schedule", url: "https://halcyon.studio/summit/schedule" }],
    clean: true,
    warnLimit: 3,
    escalation: "restrict",
    rules: [
      { kind: "banned_words", enabled: true, action: "warn", config: { words: ["free crypto", "airdrop", "dm me for", "guaranteed returns", "whatsapp me"] } },
      { kind: "block_links", enabled: true, action: "delete", config: { allowDomains: ["halcyon.studio", "t.me/halcyondispatch", "lx-factory.example"] } },
      { kind: "flood", enabled: true, action: "restrict", config: { maxMessages: 6, perSeconds: 10, restrictMinutes: 15 } },
    ],
  },
  {
    n: 2,
    channel: 4,
    welcome: true,
    text: "Hi {first_name}, welcome to Kestrel Aero Owners. Service questions go to the pinned support link; ride reports and photos are very welcome.",
    buttons: [{ text: "Owner support", url: "https://kestrelbikes.example/support" }],
    clean: false,
    warnLimit: 2,
    escalation: "ban",
    rules: [
      { kind: "banned_words", enabled: false, action: "warn", config: { words: [] } },
      { kind: "block_links", enabled: true, action: "warn", config: { allowDomains: ["kestrelbikes.example", "strava.com", "komoot.com"] } },
      { kind: "flood", enabled: true, action: "restrict", config: { maxMessages: 5, perSeconds: 10, restrictMinutes: 10 } },
    ],
  },
];

const LABELS = { banned_words: "Banned words", block_links: "Block links", flood: "Flood limit" };

const MEMBERS = [
  ["marta.lx", "Marta Lopes"], ["joaopedro", "João Pedro"], ["design_ines", "Inês Carvalho"], ["tomkerr", "Tom Kerr"],
  ["anya_k", "Anya Kowalski"], ["felixb", "Felix Brandt"], ["claire.dsgn", "Claire Dubois"], ["mateo_r", "Mateo Ruiz"],
  ["sana.m", "Sana Malik"], ["oliver_w", "Oliver Wright"], ["lena.h", "Lena Hoffmann"], ["rubenv", "Ruben Visser"],
  ["yuki_t", "Yuki Tanaka"], ["noah.p", "Noah Peters"], ["bea_s", "Beatriz Santos"], ["kaito_m", "Kaito Mori"],
];

function groupRows() {
  const groups = [];
  const rules = [];
  const events = [];
  let ruleN = 0;
  let eventN = 0;
  for (const g of GROUPS) {
    const groupId = aid("community_group", g.n);
    groups.push({
      ...own("community_group", g.n, { created: 90, updated: 6 }),
      channel_id: aid("community_channel", g.channel),
      welcome_enabled: g.welcome,
      welcome_text: g.text,
      welcome_buttons: g.buttons,
      clean_service_messages: g.clean,
      exempt_admins: true,
      warn_limit: g.warnLimit,
      escalation_action: g.escalation,
      metadata: { chatMemberUpdates: true },
      created_by: personId(11),
      deleted_at: null,
    });
    const ruleIds = {};
    g.rules.forEach((r, i) => {
      ruleN += 1;
      ruleIds[r.kind] = aid("group_rule", ruleN);
      rules.push({
        ...own("group_rule", ruleN, { created: 90, updated: 12 }),
        group_id: groupId,
        kind: r.kind,
        name: LABELS[r.kind],
        enabled: r.enabled,
        action: r.action,
        config: r.config,
        sort: i,
        metadata: {},
        created_by: personId(11),
        deleted_at: null,
      });
    });

    const push = (row, hoursBack) => {
      eventN += 1;
      const at = hoursAgo(hoursBack);
      events.push({
        id: aid("community_group_event", eventN),
        project_id: PROJECT_ID,
        group_id: groupId,
        rule_id: null,
        external_user_id: null,
        username: "",
        display_name: "",
        excerpt: "",
        reason: "",
        error: null,
        metadata: {},
        created_by: null,
        occurred_at: at,
        created_at: at,
        updated_at: at,
        deleted_at: null,
        ...row,
      });
    };

    // Joins + welcomes spread over the last few weeks.
    const joins = g.n === 1 ? 14 : 7;
    for (let i = 0; i < joins; i += 1) {
      const [username, name] = MEMBERS[(i + g.n * 3) % MEMBERS.length];
      const user = String(5_100_000_000 + g.n * 10_000 + i);
      const back = 6 + i * between(eventN + i, 10, 40);
      const viaLink = noise(i + g.n * 7) > 0.45;
      push({ event: "joined", external_user_id: user, username, display_name: name, reason: viaLink ? `Invite link: ${g.n === 1 ? "Ticket confirmation email" : "Delivery email"}` : "" }, back);
      if (g.welcome) push({ event: "welcomed", external_user_id: user, username, display_name: name, reason: "Welcome message" }, back - 0.01);
    }

    // Enforcement history.
    const spam = [
      { kind: "banned_words", user: "6602118734", username: "crypto_drops_2026", name: "Crypto Drops", text: "Free crypto airdrop for summit attendees, dm me for the link", match: "free crypto" },
      { kind: "block_links", user: "6609921455", username: "", name: "Ticket Resale", text: "Cheap summit tickets here bit.ly/summit-tix-cheap", match: "bit.ly/summit-tix-cheap" },
      { kind: "flood", user: "6611003921", username: "loud_larry", name: "Larry", text: "!!!", match: "more than 6 messages in 10s" },
      { kind: "banned_words", user: "6602118734", username: "crypto_drops_2026", name: "Crypto Drops", text: "Guaranteed returns, whatsapp me", match: "guaranteed returns" },
      { kind: "block_links", user: "6623390012", username: "promo_hub", name: "Promo Hub", text: "Join our design deals group t.me/designdealz", match: "t.me/designdealz" },
    ];
    const items = g.n === 1 ? spam : spam.filter((s) => s.kind !== "banned_words").slice(0, 2);
    items.forEach((s, i) => {
      const rule = g.rules.find((r) => r.kind === s.kind);
      if (!rule?.enabled) return;
      const back = 3 + i * 31;
      const common = { rule_id: ruleIds[s.kind], external_user_id: s.user, username: s.username, display_name: s.name, excerpt: s.text };
      const reason = `${s.kind === "banned_words" ? "Banned word" : s.kind === "block_links" ? "Link not allowed" : "Flooding"}: ${s.match}`;
      push({ ...common, event: "deleted", reason }, back);
      if (rule.action === "warn") {
        const repeat = items.slice(0, i).some((x) => x.user === s.user);
        if (repeat && g.n === 1) push({ ...common, event: "restricted", reason, metadata: { minutes: 15, escalated: true } }, back - 0.01);
        else push({ ...common, event: "warned", reason, metadata: { warnings: 1, limit: g.warnLimit } }, back - 0.01);
      }
      if (rule.action === "restrict") push({ ...common, event: "restricted", reason, metadata: { minutes: rule.config.restrictMinutes, escalated: false } }, back - 0.01);
    });
    if (g.n === 1) {
      push({ rule_id: ruleIds.block_links, event: "banned", external_user_id: "6623390012", username: "promo_hub", display_name: "Promo Hub", reason: "Banned by an admin after repeated invite spam" }, 60);
      const [leftUser, leftName] = MEMBERS[(4 + g.n * 3) % MEMBERS.length];
      push({ event: "left", external_user_id: String(5_100_000_000 + g.n * 10_000 + 4), username: leftUser, display_name: leftName }, 20);
    }
  }
  return { community_groups: groups, group_rules: rules, community_group_events: events };
}

// [channel, name, slug, utm, weight, created days ago, join rate for Telegram links].
const LINKS = [
  [1, "Newsletter footer", "hal-dispatch", { source: "email", medium: "newsletter", campaign: "dispatch" }, 9, 80, 0.42],
  [1, "Instagram link in bio", "hal-bio", { source: "instagram", medium: "link_in_bio" }, 6, 75, 0.36],
  [1, "Summit landing page", "summit-tg", { source: "landing_page", medium: "web", campaign: "halcyon-summit" }, 4, 40, 0.5],
  [2, "Pre-order email", "aero-riders", { source: "email", medium: "campaign", campaign: "kestrel-aero-launch" }, 10, 60, 0.55],
  [2, "Launch event QR", "aero-qr", { source: "qr", medium: "offline", campaign: "kestrel-aero-launch" }, 5, 30, 0.61],
  [2, "Paid social", "aero-ads", { source: "meta_ads", medium: "paid_social", campaign: "kestrel-aero-launch" }, 7, 45, 0.28],
  [3, "Ticket confirmation email", "summit-group", { source: "email", medium: "transactional", campaign: "halcyon-summit" }, 6, 70, 0.66],
  [4, "Delivery email", "aero-owners", { source: "email", medium: "transactional", campaign: "kestrel-aero-owners" }, 3, 50, 0.72],
  [5, "Café table QR", "atlas-qr", { source: "qr", medium: "offline", campaign: "atlas-cafes" }, 8, 100, 0],
  [5, "Atlas newsletter", "atlas-news", { source: "email", medium: "newsletter", campaign: "atlas-weekly" }, 6, 90, 0],
  [6, "Booking confirmation", "solace-wa", { source: "email", medium: "transactional", campaign: "solace-summer-26" }, 5, 80, 0],
  [7, "Halcyon newsletter", "hal-bts", { source: "email", medium: "newsletter", campaign: "dispatch" }, 4, 85, 0],
  [8, "Pre-order page", "kestrel-insiders", { source: "landing_page", medium: "web", campaign: "kestrel-aero-launch" }, 5, 60, 0],
];

const REFERRERS = { email: null, instagram: "https://l.instagram.com/", landing_page: "https://halcyon.studio/", qr: null, meta_ads: "https://l.facebook.com/" };

function linkAndEventRows() {
  const links = [];
  const events = [];
  let eventN = 15000;
  LINKS.forEach(([channel, name, slug, utm, weight, created, joinRate], i) => {
    const n = i + 1;
    const c = CHANNELS.find((x) => x.n === channel);
    const telegram = c.platform.startsWith("telegram");
    const linkId = aid("join_link", n);
    const planned = between(n * 13, weight * 5, weight * 8);
    let clicks = 0;
    let joins = 0;
    let lastClick = null;
    let lastJoin = null;
    for (let k = 0; k < planned && eventN < 15990; k += 1) {
      clicks += 1;
      const back = (created - 1) * noise(n * 101 + k) ** 1.4;
      const at = new Date(Date.now() - back * DAY).toISOString();
      lastClick = !lastClick || at > lastClick ? at : lastClick;
      events.push({
        id: aid("tracked_event", eventN),
        project_id: PROJECT_ID,
        contact_id: null,
        anonymous_id: null,
        name: "community_join_click",
        properties: { joinLinkId: linkId, channelId: aid("community_channel", channel), platform: c.platform, slug },
        source: "web",
        delivery_id: null,
        campaign_id: null,
        revenue: null,
        currency: null,
        url: `https://halcyon.studio/campaign/j/${slug}`,
        referrer: REFERRERS[utm.source] ?? null,
        utm,
        occurred_at: at,
        metadata: {},
        created_by: null,
        created_at: at,
        updated_at: at,
        deleted_at: null,
      });
      eventN += 1;
      if (telegram && noise(n * 977 + k) < joinRate) {
        const joinedAt = new Date(new Date(at).getTime() + between(n + k, 1, 40) * 60_000).toISOString();
        joins += 1;
        lastJoin = !lastJoin || joinedAt > lastJoin ? joinedAt : lastJoin;
        events.push({
          id: aid("tracked_event", eventN),
          project_id: PROJECT_ID,
          contact_id: null,
          anonymous_id: null,
          name: "community_join",
          properties: {
            joinLinkId: linkId,
            channelId: aid("community_channel", channel),
            platform: c.platform,
            telegramUserId: String(5_200_000_000 + n * 1000 + k),
            username: null,
            viaJoinRequest: false,
          },
          source: "social",
          delivery_id: null,
          campaign_id: null,
          revenue: null,
          currency: null,
          url: null,
          referrer: null,
          utm,
          occurred_at: joinedAt,
          metadata: {},
          created_by: null,
          created_at: joinedAt,
          updated_at: joinedAt,
          deleted_at: null,
        });
        eventN += 1;
      }
    }
    links.push({
      ...own("join_link", n, { created, updated: 1 }),
      channel_id: aid("community_channel", channel),
      slug,
      name,
      platform_url: telegram
        ? `https://t.me/+${pick(["Hx", "Kr", "Sm", "Ow"], n)}${slug.replace(/-/g, "").slice(0, 8)}${String(n).padStart(2, "0")}Q`
        : c.invite,
      utm,
      clicks,
      joins,
      last_click_at: lastClick,
      last_join_at: lastJoin,
      metadata: telegram ? { telegram: { memberLimit: null, expiresAt: null, createsJoinRequest: false } } : {},
      created_by: personId(10),
      deleted_at: null,
    });
  });
  return { join_links: links, tracked_events: events };
}

export function communitiesSeed() {
  const { join_links, tracked_events } = linkAndEventRows();
  return {
    community_channels: channelRows(),
    community_posts: postRows(),
    ...groupRows(),
    join_links,
    member_snapshots: snapshotRows(),
    // Merged into the core tracked_events table by the playground db (n = 15000–15999).
    tracked_events,
  };
}
