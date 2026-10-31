import { normalizeAb, pickLeader } from "./ab";
import { hashUnit } from "./send_time";

// The sender's half of A/B testing (isomorphic, pure), over the Campaigns-owned model in ./ab.js:
// deterministic variant assignment for the test portion, holding the remainder, and the winner pick.

// The normalized A/B config plus its variant keys, or null when the campaign isn't an A/B test.
export function abPlan(campaign) {
  if (campaign?.ab?.enabled !== true) return null;
  const ab = normalizeAb(campaign.ab);
  return { ...ab, keys: ab.variants.map((v) => v.key) };
}

// Same contact, same bucket, every time: testPercent of the audience splits evenly across variants and
// the rest is held for the winner (testPercent 100 = a straight split).
export function assignVariant(plan, contactId, campaignId) {
  if (!plan) return { variant: null, held: false };
  if (plan.testPercent < 100 && hashUnit(contactId, `${campaignId}:ab-test`) >= plan.testPercent / 100) {
    return { variant: null, held: true };
  }
  const roll = hashUnit(contactId, `${campaignId}:ab-variant`);
  return { variant: plan.keys[Math.min(plan.keys.length - 1, Math.floor(roll * plan.keys.length))], held: false };
}

// variantStats: buildCampaignReport().variants. The leader on the winner metric; ties and no data go to A.
export function chooseWinner(plan, variantStats = []) {
  if (!plan) return null;
  const leader = pickLeader(variantStats, plan.winnerMetric);
  return { key: leader?.key || plan.keys[0], uplift: leader?.uplift ?? null, tied: leader ? leader.tied : true };
}
