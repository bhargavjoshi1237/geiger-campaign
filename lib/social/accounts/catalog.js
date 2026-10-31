// Social channels catalog (isomorphic, plain config — no row data): channel metadata, OAuth scopes,
// webhook fields, default per-channel settings, platform rules and the publishing-network catalog.
// Shared by the server (connect, health, providers, webhooks) and the screens.

export const SOCIAL_CHANNELS = ["instagram", "messenger", "telegram", "tiktok", "rcs"];

export const CHANNEL_META = {
  instagram: {
    label: "Instagram",
    provider: "meta_graph",
    accountNoun: "account",
    windowHours: 24,
    humanWindowDays: 7,
    starters: true,
    profileFields: ["iceBreakers", "persistentMenu"],
  },
  messenger: {
    label: "Messenger",
    provider: "meta_graph",
    accountNoun: "page",
    windowHours: 24,
    humanWindowDays: 7,
    starters: true,
    profileFields: ["iceBreakers", "persistentMenu", "greeting"],
  },
  telegram: {
    label: "Telegram",
    provider: "telegram_bot",
    accountNoun: "bot",
    windowHours: null,
    humanWindowDays: null,
    starters: true,
    profileFields: ["commands", "description", "shortDescription"],
  },
  tiktok: {
    label: "TikTok",
    provider: "tiktok",
    accountNoun: "business account",
    windowHours: 48,
    humanWindowDays: null,
    starters: false,
    profileFields: [],
  },
  rcs: {
    label: "RCS",
    provider: "google_rcs",
    accountNoun: "agent",
    windowHours: null,
    humanWindowDays: null,
    starters: false,
    profileFields: [],
  },
};

// Messaging + comments are required; publishing, insights, lead retrieval and ad context (Social publishing, Ads,
// Chat automation) are requested too but optional, so a partial grant still connects messaging.
export const META_SCOPES = {
  messenger: {
    required: ["pages_show_list", "pages_manage_metadata", "pages_messaging", "pages_read_engagement", "pages_manage_engagement", "pages_read_user_content"],
    optional: ["business_management", "pages_manage_posts", "read_insights", "leads_retrieval", "pages_manage_ads", "ads_read", "ads_management"],
  },
  instagram: {
    required: ["pages_show_list", "pages_manage_metadata", "instagram_basic", "instagram_manage_messages", "instagram_manage_comments"],
    optional: ["business_management", "pages_read_engagement", "instagram_content_publish", "instagram_manage_insights", "ads_read", "ads_management"],
  },
};

// Page-level fields the app subscribes each connected Page to (POST /{page-id}/subscribed_apps).
export const PAGE_WEBHOOK_FIELDS = ["messages", "messaging_postbacks", "messaging_referrals", "messaging_optins", "message_reads", "feed", "mention"];
// App-level Instagram object fields (POST /{app-id}/subscriptions).
export const INSTAGRAM_WEBHOOK_FIELDS = ["messages", "messaging_postbacks", "messaging_referral", "comments", "mentions"];

export const TIKTOK_SCOPES = [
  "user.info.basic",
  "user.info.username",
  "user.info.stats",
  "user.info.profile",
  "user.account.type",
  "user.insights",
  "message.list.read",
  "message.list.send",
  "message.list.manage",
];

export const TELEGRAM_ALLOWED_UPDATES = [
  "message",
  "edited_message",
  "callback_query",
  "channel_post",
  "edited_channel_post",
  "my_chat_member",
  "chat_member",
  "chat_join_request",
  "message_reaction_count",
];

export const RBM_SCOPE = "https://www.googleapis.com/auth/rcsbusinessmessaging";
export const BUSINESS_COMMUNICATIONS_SCOPE = "https://www.googleapis.com/auth/businesscommunications";

// TikTok's business messaging API isn't offered to businesses in the EEA, Switzerland or the UK.
export const TIKTOK_RESTRICTED_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "CH", "GB",
];

export function tiktokRegionRestricted(country) {
  return Boolean(country) && TIKTOK_RESTRICTED_COUNTRIES.includes(String(country).toUpperCase());
}

export const DEFAULT_OPT_OUT_KEYWORDS = ["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "STOPALL"];
export const DEFAULT_OPT_IN_KEYWORDS = ["START", "UNSTOP", "SUBSCRIBE"];

// Per-connection settings (connection.config.settings). The chat engine reads handover, quietHours and the
// keyword lists; starters are pushed to the platform (Messenger Profile API / Telegram bot profile).
export function defaultSettings(channel) {
  return {
    handover: {
      keywords: ["agent", "human", "support"],
      message: "Thanks — someone from the team will reply here shortly.",
      pauseAutomationHours: 24,
    },
    quietHours: { enabled: false, start: "21:00", end: "08:00", timezone: "UTC" },
    optOutKeywords: DEFAULT_OPT_OUT_KEYWORDS,
    optInKeywords: DEFAULT_OPT_IN_KEYWORDS,
    ...(channel === "instagram" || channel === "messenger" ? { iceBreakers: [], persistentMenu: [] } : {}),
    ...(channel === "messenger" ? { greeting: "" } : {}),
    ...(channel === "telegram" ? { commands: [], description: "", shortDescription: "" } : {}),
  };
}

export const LIMITS = {
  iceBreakers: 4,
  persistentMenu: 20,
  greeting: 160,
  menuTitle: 30,
  iceBreakerQuestion: 80,
  telegramCommands: 100,
  telegramDescription: 512,
  telegramShortDescription: 120,
};

// Platform rules the product enforces, rendered as live constraints on each channel screen.
export const PLATFORM_RULES = {
  instagram: [
    { key: "window", title: "24-hour messaging window", detail: "Replies are free-form for 24 hours after the person's last message, comment-triggered DM, story reply or mention.", enforcement: "Sends outside the window are blocked" },
    { key: "human", title: "Human agent tag — 7 days", detail: "A person on your team can still reply for up to 7 days. Automated messages can never use this tag.", enforcement: "Applied only to human replies" },
    { key: "cap", title: "One automated DM per person per 24h", detail: "Comment and story triggers send at most one private DM to the same person in 24 hours.", enforcement: "Extra triggers are skipped" },
    { key: "handover", title: "Human handover", detail: "Every automated conversation offers a way to reach a person (handover keywords below).", enforcement: "Required in every automation" },
    { key: "private", title: "One private reply per comment", detail: "A comment can receive a single private reply within 7 days of being posted.", enforcement: "Second replies are blocked" },
  ],
  messenger: [
    { key: "window", title: "24-hour messaging window", detail: "Replies are free-form for 24 hours after the person's last message, postback or referral.", enforcement: "Sends outside the window are blocked" },
    { key: "human", title: "Human agent tag — 7 days", detail: "A person on your team can still reply for up to 7 days. Automated messages can never use this tag.", enforcement: "Applied only to human replies" },
    { key: "optin", title: "Marketing messages need opt-in", detail: "Re-engaging outside the window requires a Marketing Messages (recurring notification) opt-in token.", enforcement: "Opt-ins are logged to the consent ledger" },
    { key: "cap", title: "One automated DM per person per 24h", detail: "Comment triggers send at most one private DM to the same person in 24 hours.", enforcement: "Extra triggers are skipped" },
    { key: "handover", title: "Human handover", detail: "Every automated conversation offers a way to reach a person.", enforcement: "Required in every automation" },
  ],
  telegram: [
    { key: "start", title: "People must start the bot", detail: "Bots can only message people who opened the chat and pressed Start. There's no time window.", enforcement: "Those sends fail with the reason" },
    { key: "blocked", title: "Blocking the bot is an opt-out", detail: "When someone blocks the bot it's recorded as an opt-out and broadcasts skip them.", enforcement: "Logged to the consent ledger" },
    { key: "rate", title: "Bot rate limit", detail: "Telegram allows roughly 30 messages per second per bot across chats.", enforcement: "Over-limit sends fail with a reason" },
  ],
  tiktok: [
    { key: "region", title: "Not available in the EEA, Switzerland or the UK", detail: "TikTok doesn't offer business messaging to accounts or people in these regions.", enforcement: "Connections and sends there are refused" },
    { key: "business", title: "Business accounts only", detail: "Personal and creator accounts can't use the messaging API.", enforcement: "Checked when you connect" },
    { key: "window", title: "48-hour reply window", detail: "You can reply for 48 hours after the person's last message. Only text or a single image.", enforcement: "Sends outside the window are blocked" },
    { key: "comments", title: "No comment-to-DM", detail: "TikTok's official API doesn't support DMs triggered by comments.", enforcement: "Not offered" },
  ],
  rcs: [
    { key: "vetting", title: "Verified sender agent", detail: "Agents need brand verification and carrier launch before reaching the public; until then only registered testers receive messages.", enforcement: "Launch state shown on the account" },
    { key: "consent", title: "Opt-in required for marketing", detail: "Marketing messages go only to people with an RCS opt-in in the consent ledger. STOP replies opt them out.", enforcement: "Enforced by audience resolution" },
    { key: "capability", title: "Device capability", detail: "Recipients whose phone or carrier doesn't support RCS can't be reached on this channel.", enforcement: "Failed sends name the reason" },
  ],
};

// Networks the Social area works with. `via` = the messaging connection whose token also serves publishing;
// networks without an implemented flow are listed honestly as not available yet.
export const SOCIAL_NETWORKS = [
  { key: "instagram", label: "Instagram", channel: "instagram", uses: ["DMs", "Comments", "Publishing"], available: true },
  { key: "facebook_page", label: "Facebook Page", channel: "messenger", uses: ["Messenger", "Comments", "Publishing"], available: true },
  { key: "telegram", label: "Telegram", channel: "telegram", uses: ["DMs", "Channels", "Groups"], available: true },
  { key: "tiktok", label: "TikTok", channel: "tiktok", uses: ["DMs"], available: true },
  { key: "rcs", label: "RCS (Google)", channel: "rcs", uses: ["Rich messaging"], available: true },
  { key: "threads", label: "Threads", channel: null, uses: ["Publishing"], available: false },
  { key: "linkedin", label: "LinkedIn", channel: null, uses: ["Publishing"], available: false },
  { key: "x", label: "X", channel: null, uses: ["Publishing"], available: false },
  { key: "youtube", label: "YouTube", channel: null, uses: ["Publishing"], available: false },
  { key: "pinterest", label: "Pinterest", channel: null, uses: ["Publishing"], available: false },
  { key: "google_business", label: "Google Business Profile", channel: null, uses: ["Posts", "Reviews"], available: false },
];

export const CONNECTION_STATUS_MAP = {
  connected: { label: "Connected", variant: "success" },
  pending: { label: "Pending", variant: "warning" },
  error: { label: "Needs attention", variant: "danger" },
  disconnected: { label: "Disconnected", variant: "neutral" },
};
