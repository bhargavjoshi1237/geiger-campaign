import { createClient } from "./client";

let _cached = null;
let _cacheTimestamp = 0;
const CACHE_TTL = 30 * 1000;

const AVATAR_BUCKET = "pfp";

// Suite avatar URL (mirrors geiger-dash lib/avatar-url.js): `?v=` busts the cache on each upload.
function storageAvatarUrl(userId, version = 0) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !userId) return "";
  const url = `${base}/storage/v1/object/public/${AVATAR_BUCKET}/${userId}/latest.jpg`;
  return version ? `${url}?v=${version}` : url;
}

// The OAuth provider's original picture; identities survive an upload overwriting user_metadata.avatar_url.
function providerAvatarUrl(user) {
  const identities = Array.isArray(user?.identities) ? user.identities : [];
  for (const identity of identities) {
    const data = identity?.identity_data || {};
    const url = data.avatar_url || data.picture;
    if (url) return String(url);
  }
  return "";
}

// Uploaded picture → removed (initials) → provider picture → legacy unversioned upload.
function avatarUrlForUser(user) {
  if (!user?.id) return "";
  const meta = user.user_metadata || {};
  const version = Number(meta.avatar_version) || 0;
  if (version) return storageAvatarUrl(user.id, version);
  if ("avatar_version" in meta) return "";
  return providerAvatarUrl(user) || storageAvatarUrl(user.id, 0);
}

function parseSession(session) {
  if (!session?.user) return null;

  const meta = session.user.user_metadata ?? {};
  const email = session.user.email ?? "";

  return {
    id: session.user.id,
    name:
      meta.full_name ||
      meta.name ||
      email.split("@")[0] ||
      "User",
    email,
    avatar: meta.avatar_url || null,
    avatarUrl: avatarUrlForUser(session.user),
  };
}

export async function getUser() {
  const now = Date.now();
  if (_cached && now - _cacheTimestamp < CACHE_TTL) {
    return _cached;
  }

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const user = parseSession(session);

  _cached = user;
  _cacheTimestamp = now;

  return user;
}

export function getUserCached() {
  return _cached;
}

export function invalidateUserCache() {
  _cached = null;
  _cacheTimestamp = 0;
}
