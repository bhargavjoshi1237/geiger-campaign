import * as campaigns from "@/lib/campaigns/worker";
import * as automations from "@/lib/automations/worker";
import * as commerce from "@/lib/commerce/worker";
import * as webhooks from "@/lib/webhooks/worker";
import * as deliverability from "@/lib/deliverability/worker";
import * as broadcasts from "@/lib/broadcasts/worker";
import * as social from "@/lib/social/worker";
import * as chat from "@/lib/chat/worker";
import * as communities from "@/lib/communities/worker";
import * as ads from "@/lib/ads/worker";
import * as creators from "@/lib/creators/worker";

// Every scheduled job, in run order. Each area owns its worker module ({ name, run(ctx) }); this list
// doesn't change when a job is implemented.
export const JOBS = [campaigns, automations, broadcasts, chat, social, communities, commerce, ads, creators, webhooks, deliverability];
