// Starter email layouts (config, isomorphic): the structures the Templates screen offers out of the box.
// Copy is instructional placeholder text the author replaces; images are empty slots.
// OWNER: Campaigns.

import { DEFAULT_SETTINGS } from "./blocks";

const b = (id, type, props = {}, extra = {}) => ({ id, type, props, ...extra });

const doc = (blocks, settings = {}) => ({ version: 1, blocks, settings: { ...DEFAULT_SETTINGS, ...settings } });

export const TEMPLATE_CATEGORIES = [
  { value: "newsletter", label: "Newsletter" },
  { value: "announcement", label: "Announcement" },
  { value: "promotion", label: "Promotion" },
  { value: "event", label: "Event" },
  { value: "welcome", label: "Welcome" },
  { value: "ecommerce", label: "E-commerce" },
];

export const EMAIL_STARTERS = [
  {
    key: "newsletter",
    name: "Newsletter",
    category: "newsletter",
    description: "Lead story, two secondary stories and social links.",
    subject: "This month at {{company|our studio}}",
    preheader: "The lead story, two quick reads and what's next.",
    doc: () =>
      doc([
        b("nl_1", "image", { alt: "Logo", width: 140, align: "left", padding: 16 }),
        b("nl_2", "heading", { text: "The month in brief", level: 1 }),
        b("nl_3", "text", { text: "Hi {{first_name|there}},\n\nOpen with one or two sentences on why this issue is worth reading." }),
        b("nl_4", "image", { alt: "Lead story image", radius: 8 }),
        b("nl_5", "heading", { text: "Lead story headline", level: 2 }),
        b("nl_6", "text", { text: "Summarise the story in two or three sentences, then link to the full piece." }),
        b("nl_7", "button", { label: "Read the story", href: "" }),
        b("nl_8", "divider"),
        b("nl_9", "columns", {
          count: 2,
          columns: [
            { blocks: [b("nl_9a", "heading", { text: "Second story", level: 3 }), b("nl_9b", "text", { text: "A short summary and a [link](#).", fontSize: 15 })] },
            { blocks: [b("nl_9c", "heading", { text: "Third story", level: 3 }), b("nl_9d", "text", { text: "A short summary and a [link](#).", fontSize: 15 })] },
          ],
        }),
        b("nl_10", "divider"),
        b("nl_11", "social", { useBrand: true }),
      ]),
  },
  {
    key: "announcement",
    name: "Product announcement",
    category: "announcement",
    description: "Hero image, headline, three benefits and one call to action.",
    subject: "Introducing something new",
    preheader: "What it is, why it matters and how to get it.",
    doc: () =>
      doc([
        b("an_1", "image", { alt: "Product hero image", radius: 8 }),
        b("an_2", "heading", { text: "Introducing the new product", level: 1, align: "center" }),
        b("an_3", "text", { text: "One sentence on what it is and who it's for.", align: "center", fontSize: 17 }),
        b("an_4", "button", { label: "See what's new", align: "center" }),
        b("an_5", "spacer", { height: 16 }),
        b("an_6", "columns", {
          count: 3,
          columns: [
            { blocks: [b("an_6a", "heading", { text: "Benefit one", level: 3 }), b("an_6b", "text", { text: "A sentence about it.", fontSize: 14 })] },
            { blocks: [b("an_6c", "heading", { text: "Benefit two", level: 3 }), b("an_6d", "text", { text: "A sentence about it.", fontSize: 14 })] },
            { blocks: [b("an_6e", "heading", { text: "Benefit three", level: 3 }), b("an_6f", "text", { text: "A sentence about it.", fontSize: 14 })] },
          ],
        }),
      ]),
  },
  {
    key: "promotion",
    name: "Promotion",
    category: "promotion",
    description: "Offer headline, two featured products and the fine print.",
    subject: "{{first_name|Hi}}, your offer ends Sunday",
    preheader: "The offer, the products and the code.",
    doc: () =>
      doc([
        b("pr_1", "heading", { text: "The offer in one line", level: 1, align: "center" }),
        b("pr_2", "text", { text: "Say what's discounted, by how much and until when. Use code **CODE** at checkout.", align: "center" }),
        b("pr_3", "button", { label: "Shop the offer", align: "center" }),
        b("pr_4", "divider"),
        b("pr_5", "product", { name: "Featured product", description: "One line on why it's worth it.", price: "", layout: "side" }),
        b("pr_6", "product", { name: "Second product", description: "One line on why it's worth it.", price: "", layout: "side" }),
        b("pr_7", "text", { text: "Terms: state the dates, exclusions and limits of the offer.", fontSize: 13, align: "center" }),
      ]),
  },
  {
    key: "event",
    name: "Event invitation",
    category: "event",
    description: "Date, place and agenda with an RSVP button.",
    subject: "You're invited",
    preheader: "Date, place and how to save your seat.",
    doc: () =>
      doc([
        b("ev_1", "image", { alt: "Event image", radius: 8 }),
        b("ev_2", "heading", { text: "You're invited", level: 1 }),
        b("ev_3", "text", { text: "**When:** Day, date, time\n**Where:** Venue, city\n\nOne or two sentences on what attendees get out of it." }),
        b("ev_4", "button", { label: "Save your seat" }),
        b("ev_5", "divider"),
        b("ev_6", "heading", { text: "Agenda", level: 2 }),
        b("ev_7", "text", { text: "09:00 Arrival\n09:30 First session\n12:00 Lunch" }),
      ]),
  },
  {
    key: "welcome",
    name: "Welcome",
    category: "welcome",
    description: "Greeting, three first steps and one button.",
    subject: "Welcome, {{first_name|friend}}",
    preheader: "Three things to do first.",
    doc: () =>
      doc([
        b("wl_1", "heading", { text: "Welcome, {{first_name|there}}", level: 1 }),
        b("wl_2", "text", { text: "Thank them for signing up and say what they'll receive and how often." }),
        b("wl_3", "columns", {
          count: 3,
          columns: [
            { blocks: [b("wl_3a", "heading", { text: "1. First step", level: 3 }), b("wl_3b", "text", { text: "What to do and why.", fontSize: 14 })] },
            { blocks: [b("wl_3c", "heading", { text: "2. Second step", level: 3 }), b("wl_3d", "text", { text: "What to do and why.", fontSize: 14 })] },
            { blocks: [b("wl_3e", "heading", { text: "3. Third step", level: 3 }), b("wl_3f", "text", { text: "What to do and why.", fontSize: 14 })] },
          ],
        }),
        b("wl_4", "button", { label: "Get started" }),
      ]),
  },
  {
    key: "letter",
    name: "Plain letter",
    category: "newsletter",
    description: "A personal, text-only note that reads like a one-to-one email.",
    subject: "A quick note",
    preheader: "",
    doc: () =>
      doc(
        [
          b("lt_1", "text", { text: "Hi {{first_name|there}},\n\nWrite the way you'd write to one person. Keep it short and end with a single ask.\n\nThanks,\nYour name" }),
        ],
        { contentBackground: "#ffffff", backgroundColor: "#ffffff" },
      ),
  },
];

export function getStarter(key) {
  return EMAIL_STARTERS.find((s) => s.key === key) || null;
}
