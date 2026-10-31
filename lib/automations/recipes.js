// Recipe catalog (isomorphic, pure config): pre-built automations a team launches as a draft and edits.
// build() returns the full trigger + graph + settings; node ids are sequential (n1…) so a recipe's
// "engaged with an earlier message" conditions can point at the email they check.

import { buildGraph } from "./graph.js";
import { DEFAULT_SETTINGS } from "./model.js";
import { defaultTrigger } from "./triggers.js";

export const RECIPE_CATEGORIES = ["Onboarding", "E-commerce", "Retention", "Lifecycle"];

const email = (subject, heading, body, extra = {}) => ({ type: "send_email", config: { source: "compose", subject, heading, body, ...extra } });
const wait = (amount, unit = "days") => ({ type: "wait", config: { mode: "duration", amount, unit } });
const tag = (addTags = [], removeTags = [], leadScoreDelta = 0) => ({ type: "update_contact", config: { addTags, removeTags, leadScoreDelta } });
const opened = (messageNodeId, branches, engagement = "opened") => ({
  type: "condition",
  config: { mode: "message", messageNodeId, engagement },
  branches,
});
const goal = (event, extra = {}) => ({ type: "goal", config: { source: "inline", event, ifNotMet: "continue", ...extra } });
const exit = (reason) => ({ type: "exit", config: { reason } });

const settings = (patch = {}) => ({ ...DEFAULT_SETTINGS, ...patch });

export const RECIPES = [
  {
    key: "welcome_series",
    name: "Welcome series",
    description: "Greet new subscribers and set expectations over three emails.",
    category: "Onboarding",
    kind: "workflow",
    goalText: "Turn a fresh sign-up into an engaged reader in their first week.",
    audience: "Newsletters and any list with a sign-up form.",
    build() {
      const trigger = defaultTrigger("list_joined");
      return {
        trigger,
        settings: settings(),
        graph: buildGraph(trigger, [
          email("Welcome, {{first_name|there}} — here's what to expect", "You're in", "Thanks for subscribing. Expect one email a week with what we're working on and the best of what we've read.\n\nReply to this email any time — a person reads every one."),
          wait(2),
          email("Three things to try first", "Getting started", "Here are the three things most new readers find useful first. Each takes less than five minutes."),
          wait(3),
          opened("n1", {
            yes: [email("The best of what we've published", "Start here", "A short reading list of the pieces our readers come back to most.")],
            no: [tag(["welcome-unengaged"])],
          }),
        ]),
      };
    },
  },
  {
    key: "abandoned_cart",
    name: "Abandoned cart recovery",
    description: "Remind shoppers by email, then SMS, and close with an incentive.",
    category: "E-commerce",
    kind: "journey",
    goalText: "Recover revenue from checkouts that stalled before payment. Contacts exit the moment they order.",
    audience: "Stores with a connected e-commerce platform.",
    build() {
      const trigger = defaultTrigger("cart_abandoned");
      return {
        trigger,
        settings: settings({ reentry: true, exitOnGoal: true, quietHours: { ...DEFAULT_SETTINGS.quietHours, enabled: true } }),
        graph: buildGraph(trigger, [
          wait(1, "hours"),
          email("You left something in your cart", "Still deciding?", "Your cart is saved and ready when you are.", { buttonLabel: "Return to cart", buttonUrl: "https://example.com/cart" }),
          wait(1),
          { type: "send_sms", config: { body: "Hi {{first_name|there}}, your cart is still saved. Finish checking out: https://example.com/cart Reply STOP to opt out." } },
          wait(2),
          email("10% off to finish your order", "A little help deciding", "Use code COMEBACK10 at checkout in the next 48 hours.", { buttonLabel: "Complete checkout", buttonUrl: "https://example.com/cart" }),
          goal("order_completed"),
        ]),
      };
    },
  },
  {
    key: "browse_abandonment",
    name: "Browse abandonment",
    description: "Follow up when a known contact views a product but doesn't buy.",
    category: "E-commerce",
    kind: "workflow",
    goalText: "Turn product interest into a first order without discounting.",
    audience: "Stores with the tracking snippet on product pages.",
    build() {
      const trigger = defaultTrigger("product_viewed");
      return {
        trigger,
        settings: settings({ reentry: true, frequencyCap: { enabled: true, max: 2, periodDays: 7 } }),
        graph: buildGraph(trigger, [
          wait(2, "hours"),
          {
            type: "condition",
            config: { mode: "event", event: "order_completed", performed: true, withinDays: 1 },
            branches: {
              yes: [exit("Already ordered")],
              no: [
                email("Still thinking it over?", "Take another look", "The product you were looking at is still in stock. Questions about sizing or delivery? Just reply.", { buttonLabel: "View product", buttonUrl: "https://example.com" }),
                goal("order_completed", { windowDays: 7 }),
              ],
            },
          },
        ]),
      };
    },
  },
  {
    key: "post_purchase",
    name: "Post-purchase follow-up",
    description: "Thank new customers, recommend what pairs well, then ask for a review.",
    category: "E-commerce",
    kind: "workflow",
    goalText: "Build loyalty after the first order and collect social proof.",
    audience: "Customers who just completed an order.",
    build() {
      const trigger = defaultTrigger("order_completed");
      return {
        trigger,
        settings: settings({ reentry: true }),
        graph: buildGraph(trigger, [
          tag(["customer"], [], 10),
          email("Thanks for your order, {{first_name|there}}", "Order confirmed", "We're getting it ready. You'll get tracking details as soon as it ships."),
          wait(5),
          email("Pairs well with your order", "You might also like", "A few things other customers picked up alongside theirs."),
          wait(7),
          email("How did we do?", "Tell us what you think", "A two-minute review helps other shoppers and helps us improve.", { buttonLabel: "Write a review", buttonUrl: "https://example.com/reviews" }),
        ]),
      };
    },
  },
  {
    key: "win_back",
    name: "Win-back",
    description: "Re-engage lapsed contacts and sunset the ones who stay quiet.",
    category: "Retention",
    kind: "workflow",
    goalText: "Win back lapsed contacts and keep the list healthy for deliverability.",
    audience: "Subscribers with no tracked activity for 90 days.",
    build() {
      const trigger = { ...defaultTrigger("inactivity"), days: 90 };
      return {
        trigger,
        settings: settings(),
        graph: buildGraph(trigger, [
          email("We miss you, {{first_name|there}}", "It's been a while", "Here's what's new since you last visited."),
          wait(7),
          opened("n1", {
            yes: [tag(["re-engaged"])],
            no: [
              email("Should we stop emailing you?", "Still want to hear from us?", "Click below to stay subscribed. If we don't hear back, we'll stop sending.", { buttonLabel: "Keep me subscribed", buttonUrl: "https://example.com/preferences" }),
              wait(7),
              opened("n5", { yes: [tag(["re-engaged"])], no: [tag(["sunset"])] }, "clicked"),
            ],
          }),
        ]),
      };
    },
  },
  {
    key: "birthday",
    name: "Birthday reward",
    description: "Send a gift on each contact's birthday and a reminder before it expires.",
    category: "Lifecycle",
    kind: "workflow",
    goalText: "Create a personal moment that drives a repeat purchase.",
    audience: "Contacts with a birthday field on their profile.",
    build() {
      const trigger = { ...defaultTrigger("date_attribute"), field: "birthday" };
      return {
        trigger,
        settings: settings({ reentry: true }),
        graph: buildGraph(trigger, [
          email("Happy birthday, {{first_name|there}}", "A gift from us", "Enjoy 15% off anything this week with code BIRTHDAY15."),
          wait(6),
          {
            type: "condition",
            config: { mode: "event", event: "order_completed", performed: true, withinDays: 6 },
            branches: {
              yes: [exit("Used the gift")],
              no: [email("Your birthday gift expires tomorrow", "Last day", "Code BIRTHDAY15 is good until midnight.")],
            },
          },
        ]),
      };
    },
  },
  {
    key: "lead_nurture",
    name: "Lead nurture",
    description: "Educate new leads over three weeks and hand engaged ones to sales.",
    category: "Onboarding",
    kind: "workflow",
    goalText: "Warm up new leads until they're ready for a sales conversation.",
    audience: "B2B leads captured from forms and landing pages.",
    build() {
      const trigger = defaultTrigger("form_submitted");
      return {
        trigger,
        settings: settings(),
        graph: buildGraph(trigger, [
          email("Your guide is here", "Thanks for your interest", "Here's the guide you asked for, plus a short note on how teams like yours use it."),
          wait(1, "weeks"),
          email("How one team cut their reporting time in half", "Customer story", "A short case study from a team with a similar setup."),
          wait(1, "weeks"),
          email("Join our live product walkthrough", "Webinar invite", "Thirty minutes, live questions, recording sent to everyone who registers.", { buttonLabel: "Save my seat", buttonUrl: "https://example.com/webinar" }),
          wait(3),
          opened("n5", {
            yes: [tag(["sales-ready"], [], 20), { type: "notify", config: { subject: "{{first_name}} {{last_name}} is sales-ready", message: "{{email}} clicked the webinar invite in the lead nurture." } }],
            no: [tag(["nurture-cold"])],
          }, "clicked"),
        ]),
      };
    },
  },
  {
    key: "re_engagement",
    name: "Cross-channel re-engagement",
    description: "Nudge quiet subscribers by email, then SMS, then push.",
    category: "Retention",
    kind: "journey",
    goalText: "Bring inactive subscribers back on whichever channel they still answer.",
    audience: "Subscribers with SMS and push opt-in who stopped engaging.",
    build() {
      const trigger = { ...defaultTrigger("inactivity"), days: 45 };
      return {
        trigger,
        settings: settings({ quietHours: { ...DEFAULT_SETTINGS.quietHours, enabled: true }, frequencyCap: { enabled: true, max: 3, periodDays: 7 } }),
        graph: buildGraph(trigger, [
          email("A quick update from us", "Here's what you missed", "The three most useful things we shipped this month."),
          wait(3),
          opened("n1", {
            yes: [tag(["re-engaged"])],
            no: [
              { type: "send_sms", config: { body: "Hi {{first_name|there}} — we've added a few things you asked for. See what's new: https://example.com Reply STOP to opt out." } },
              wait(4),
              { type: "send_push", config: { title: "New since your last visit", body: "Take a look at what's changed.", url: "https://example.com" } },
              goal("page_viewed", { windowDays: 14 }),
            ],
          }),
        ]),
      };
    },
  },
];

export function recipeByKey(key) {
  return RECIPES.find((r) => r.key === key) || null;
}
