// The topbar bell (public.flow_notifications) for the signed-in visitor: the
// week's mentions, discussions, approvals and send results across Halcyon's
// client campaigns.

import { PLAYGROUND_PERSON } from "../cast.js";
import { hoursAgo, minutesAgo, sid } from "./helpers.js";

const NOTIFICATIONS = [
  {
    at: minutesAgo(12),
    type: "mention",
    icon: "AtSign",
    tone: "blue",
    title: "Priya Nair mentioned you",
    description: "Kestrel Aero launch: pre-order email, hero section.",
    extra: { type: "comment", text: "@Alex can you sign off the hero copy before 4pm? Kestrel wants the pre-order send live tomorrow morning." },
  },
  {
    at: minutesAgo(48),
    type: "approval",
    icon: "ShieldCheck",
    tone: "amber",
    title: "Approval requested",
    description: "Sofia Rossi wants to send \"Atlas Coffee: café opening invite\" to 12,480 contacts.",
    extra: { type: "actions", options: ["Review later", "Approve"] },
  },
  {
    at: hoursAgo(3),
    type: "discussion",
    icon: "MessagesSquare",
    tone: "emerald",
    title: "New discussion in Solace Summer '26",
    description: "Noor Haddad started a thread on list segmentation.",
    extra: {
      type: "discussion",
      channel: "#solace-summer",
      replies: 6,
      message: "Should we split the Barcelona list by language before the July drop? Catalan opens are 9 points higher.",
      author: "Noor Haddad",
      participants: ["NH", "AJ", "PN"],
    },
  },
  {
    at: hoursAgo(5),
    type: "update",
    icon: "Send",
    tone: "violet",
    title: "Campaign delivered",
    description: "Northwind Outdoor: Autumn gear drop reached 48,210 contacts. 41.2% opens so far.",
    read: true,
  },
  {
    at: hoursAgo(9),
    type: "update",
    icon: "Paperclip",
    tone: "slate",
    title: "Kenji Watanabe shared assets",
    description: "Motion cuts for the Kestrel Aero launch email are ready.",
    extra: {
      type: "file",
      files: [
        { name: "kestrel-aero-hero.mp4", size: "18.4 MB" },
        { name: "kestrel-aero-stills.zip", size: "42.1 MB" },
      ],
    },
  },
  {
    at: hoursAgo(20),
    type: "alert",
    icon: "ShieldAlert",
    tone: "red",
    title: "Bounce rate above threshold",
    description: "Meridian Bank statement reminders bounced at 3.1%. Review list hygiene before the next send.",
  },
  {
    at: hoursAgo(27),
    type: "mention",
    icon: "AtSign",
    tone: "blue",
    title: "Maya Chen mentioned you",
    description: "Team & Roles: Client Reviewer role for Lumen Health.",
    extra: { type: "comment", text: "@Alex added Grace from Lumen as a Client Reviewer; can you double-check she only sees Campaigns and Reporting?" },
    read: true,
  },
  {
    at: hoursAgo(34),
    type: "update",
    icon: "Route",
    tone: "emerald",
    title: "Journey milestone",
    description: "Lumen Health onboarding journey passed 5,000 completions this month.",
    read: true,
  },
  {
    at: hoursAgo(52),
    type: "discussion",
    icon: "MessagesSquare",
    tone: "emerald",
    title: "Reply in Fernway weekly digest",
    description: "Ava Johnson replied to your note on the recipe module.",
    extra: {
      type: "discussion",
      channel: "#fernway-digest",
      replies: 3,
      message: "Swapped the recipe block for the seasonal box. Click-through on that slot is up 18% week over week.",
      author: "Ava Johnson",
      participants: ["AJ", "AR"],
    },
    read: true,
  },
  {
    at: hoursAgo(75),
    type: "mention",
    icon: "AtSign",
    tone: "blue",
    title: "Ravi Patel mentioned you",
    description: "Orbit Audio template refresh: dark-mode footer.",
    extra: { type: "comment", text: "@Alex the new footer passes the dark-mode checks in Gmail and Outlook. Ready to roll out to all Orbit templates." },
    read: true,
  },
];

// Tailwind classes the dropdown applies to each icon tile.
const TONES = {
  blue: ["bg-blue-500/10", "text-blue-600 dark:text-blue-400"],
  amber: ["bg-amber-500/10", "text-amber-600 dark:text-amber-400"],
  emerald: ["bg-emerald-500/10", "text-emerald-600 dark:text-emerald-400"],
  violet: ["bg-violet-500/10", "text-violet-600 dark:text-violet-400"],
  red: ["bg-red-500/10", "text-red-600 dark:text-red-400"],
  slate: ["bg-surface-card", "text-text-secondary"],
};

export function notificationsSeed() {
  return {
    flow_notifications: NOTIFICATIONS.map((n, i) => {
      const [bg, fg] = TONES[n.tone];
      return {
        id: sid("notification", i + 1),
        user_id: PLAYGROUND_PERSON.id,
        title: n.title,
        description: n.description,
        type: n.type,
        icon: n.icon,
        time: n.at,
        read: Boolean(n.read),
        extra: n.extra ?? null,
        bg_color: bg,
        icon_color: fg,
        created_at: n.at,
      };
    }),
  };
}
