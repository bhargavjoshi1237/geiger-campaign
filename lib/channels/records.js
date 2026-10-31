// Server-side record helpers shared by the channel webhooks and providers (service-role db): find or
// create a contact by phone/email, read and append channel consent, and thread inbound messages into
// the inbox (conversations + conversation_messages). Never throw; failures are logged and return null.

export async function findContact(db, projectId, { email, phone }) {
  if (!email && !phone) return null;
  let query = db.from("contacts").select("*").eq("project_id", projectId).is("deleted_at", null).limit(1);
  query = email ? query.ilike("email", String(email).trim()) : query.eq("phone", phone);
  const { data } = await query.maybeSingle();
  return data || null;
}

// Existing contact by address, or a new one tagged with where it came from.
export async function findOrCreateContact(db, projectId, { email, phone, firstName = "", lastName = "", source }) {
  const existing = await findContact(db, projectId, { email, phone });
  if (existing) return { contact: existing, created: false };
  const { data, error } = await db
    .from("contacts")
    .insert({
      project_id: projectId,
      email: email ? String(email).trim().toLowerCase() : null,
      phone: phone || null,
      first_name: firstName,
      last_name: lastName,
      source,
      status: "subscribed",
    })
    .select("*")
    .single();
  if (error) {
    // A concurrent webhook may have created it first (unique email index).
    const again = await findContact(db, projectId, { email, phone });
    if (again) return { contact: again, created: false };
    console.error("[channels.records.contact]", error.message);
    return { contact: null, created: false };
  }
  return { contact: data, created: true };
}

// Latest consent row for (contact, channel) — the ledger is append-only and the newest row wins.
export async function latestConsent(db, projectId, contactId, channel) {
  if (!contactId) return null;
  const { data, error } = await db
    .from("contact_consents")
    .select("status, source, captured_at")
    .eq("project_id", projectId)
    .eq("contact_id", contactId)
    .eq("channel", channel)
    .is("deleted_at", null)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

export async function recordConsent(db, { projectId, contactId, channel, status, source, proof = {} }) {
  if (!contactId) return false;
  const { error } = await db.from("contact_consents").insert({
    project_id: projectId,
    contact_id: contactId,
    channel,
    status,
    source,
    proof,
    captured_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[channels.records.consent]", error.message);
    return false;
  }
  return true;
}

// The delivery row a provider is sending for (contact, campaign, source).
export async function deliveryContext(db, deliveryId) {
  if (!deliveryId) return null;
  const { data } = await db
    .from("deliveries")
    .select("id, contact_id, campaign_id, source_type, source_id, metadata")
    .eq("id", deliveryId)
    .maybeSingle();
  return data || null;
}

// Find or open the inbox thread for (connection, external thread key) and append one inbound message.
export async function threadInbound(
  db,
  { projectId, channel, kind, connectionId, contactId, threadKey, title, body, attachments = [], externalId, metadata = {}, windowHours = null },
) {
  const now = new Date().toISOString();
  let conversation = null;
  let created = false;

  if (threadKey) {
    let query = db
      .from("conversations")
      .select("*")
      .eq("project_id", projectId)
      .eq("external_thread_id", threadKey)
      .is("deleted_at", null);
    query = connectionId ? query.eq("connection_id", connectionId) : query.is("connection_id", null);
    const { data } = await query.limit(1).maybeSingle();
    conversation = data || null;
  }

  if (!conversation) {
    const { data, error } = await db
      .from("conversations")
      .insert({
        project_id: projectId,
        channel,
        kind,
        connection_id: connectionId,
        contact_id: contactId,
        external_thread_id: threadKey,
        title,
        status: "open",
        unread_count: 0,
      })
      .select("*")
      .single();
    if (error) {
      console.error("[channels.records.thread]", error.message);
      return null;
    }
    conversation = data;
    created = true;
  }

  const { data: message, error: messageError } = await db
    .from("conversation_messages")
    .insert({
      project_id: projectId,
      conversation_id: conversation.id,
      direction: "inbound",
      sender_type: "contact",
      body: String(body || ""),
      attachments,
      external_id: externalId || null,
      status: "received",
      sent_at: now,
      metadata,
    })
    .select("id")
    .single();
  // A provider retry of the same message hits the (conversation_id, external_id) unique index.
  if (messageError) {
    if (messageError.code === "23505") return { conversation, message: null, created, duplicate: true };
    console.error("[channels.records.message]", messageError.message);
    return { conversation, message: null, created };
  }

  await db
    .from("conversations")
    .update({
      last_message_at: now,
      last_inbound_at: now,
      unread_count: Number(conversation.unread_count || 0) + 1,
      ...(windowHours ? { window_expires_at: new Date(Date.now() + windowHours * 3_600_000).toISOString() } : {}),
      ...(conversation.status === "resolved" ? { status: "open" } : {}),
      ...(contactId && !conversation.contact_id ? { contact_id: contactId } : {}),
    })
    .eq("id", conversation.id);

  return { conversation, message, created };
}

// Records an outbound auto-reply on the thread (not a delivery: it went back as the webhook response).
export async function threadAutoReply(db, { projectId, conversationId, body }) {
  if (!conversationId || !body) return;
  const now = new Date().toISOString();
  await db.from("conversation_messages").insert({
    project_id: projectId,
    conversation_id: conversationId,
    direction: "outbound",
    sender_type: "system",
    body,
    status: "sent",
    sent_at: now,
    metadata: { autoReply: true },
  });
  await db.from("conversations").update({ last_message_at: now }).eq("id", conversationId);
}
