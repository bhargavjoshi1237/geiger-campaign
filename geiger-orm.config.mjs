// Migration config for @geiger/orm. This product's tables live in the dedicated
// "campaign" Postgres schema of the suite-shared Supabase project, and so does
// its migration ledger (campaign.geiger_migrations).
export default {
  schema: "campaign",
  url: process.env.STRING_URI,
};
