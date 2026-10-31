// The email document a "write here" email step sends (isomorphic, pure): heading, body (paragraphs,
// **bold**, [links](url) and merge tags) and an optional button, in the Email Builder's block schema.
// Shared by the step's preview and the engine so what you preview is what's sent.

import { createBlock, emptyDocument } from "../email/blocks.js";

export function composeEmailDocument(config = {}) {
  const doc = emptyDocument();
  const blocks = [];
  const heading = String(config.heading || "").trim();
  const body = String(config.body || "").trim();
  const label = String(config.buttonLabel || "").trim();
  const href = String(config.buttonUrl || "").trim();
  if (heading) blocks.push(createBlock("heading", { text: heading, level: 1 }));
  if (body) blocks.push(createBlock("text", { text: body }));
  if (label && href) blocks.push(createBlock("button", { label, href }));
  return { ...doc, blocks };
}
