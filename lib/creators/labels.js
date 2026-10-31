// Creators vocabulary (isomorphic, pure): option lists shared by the screens and the server emails.

export const DELIVERABLE_KINDS = [
  { value: "instagram_post", label: "Instagram post" },
  { value: "instagram_reel", label: "Instagram Reel" },
  { value: "instagram_story", label: "Instagram Story" },
  { value: "tiktok_video", label: "TikTok video" },
  { value: "youtube_video", label: "YouTube video" },
  { value: "youtube_short", label: "YouTube Short" },
  { value: "blog_post", label: "Blog post" },
  { value: "ugc_asset", label: "UGC asset" },
  { value: "other", label: "Other" },
];

export const DELIVERABLE_LABELS = Object.fromEntries(DELIVERABLE_KINDS.map((k) => [k.value, k.label]));

export const NETWORKS = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "x", label: "X" },
  { value: "twitch", label: "Twitch" },
];

export const UGC_KINDS = [
  { value: "post", label: "Post" },
  { value: "reel", label: "Reel" },
  { value: "story", label: "Story" },
  { value: "video", label: "Video" },
  { value: "image", label: "Image" },
  { value: "review", label: "Review" },
  { value: "other", label: "Other" },
];

export const USAGE_CHANNELS = [
  { value: "organic", label: "Organic social" },
  { value: "paid", label: "Paid ads" },
  { value: "email", label: "Email" },
  { value: "website", label: "Website" },
  { value: "ooh", label: "Print & out-of-home" },
];

export const USAGE_LABELS = Object.fromEntries(USAGE_CHANNELS.map((c) => [c.value, c.label]));

export const PAYOUT_METHODS = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "paypal", label: "PayPal" },
  { value: "wise", label: "Wise" },
  { value: "stripe", label: "Stripe" },
  { value: "other", label: "Other" },
];
