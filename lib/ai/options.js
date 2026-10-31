// AI assistant input vocabularies (isomorphic config): shared by the screens and the server tools so both
// validate against the same lists.

export const BRIEF_GOALS = ["Awareness", "Acquisition", "Conversion", "Retention", "Re-engagement", "Launch", "Event promotion"];

export const BRIEF_CHANNELS = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "multi", label: "Multi-channel" },
];

export const TONES = ["Friendly", "Professional", "Bold", "Playful", "Urgent", "Warm"];

export const LENGTHS = ["Short", "Medium", "Long"];

export const AI_TOOLS = {
  brief: "Campaign brief",
  copy: "Copy",
  subject_lines: "Subject lines",
  segment: "Segment suggestions",
  health_explain: "Health explanation",
};
