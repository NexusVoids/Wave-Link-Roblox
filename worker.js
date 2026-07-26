/**
 * WaveLink — OAuth + Groups + Communities Worker
 * ---------------------------------------------------------------
 * AUTH ENDPOINTS
 *   GET  /api/oauth/start                 -> redirects to Roblox login
 *   GET  /api/oauth/callback              -> Roblox redirects back here
 *   GET  /api/oauth/session?ticket=XXXX   -> trades ticket for { profile, sessionToken }
 *
 * GROUPS / COMMUNITIES (all require header: Authorization: Bearer <sessionToken>)
 *   GET  /api/groups
 *     -> the caller's Roblox groups, with icons and role/rank, each
 *        flagged with whether a WaveLink community already exists.
 *
 *   POST /api/communities/create   body: { groupId }
 *     -> only succeeds if the caller is the Roblox GROUP OWNER.
 *        Creates the community row in D1 and auto-assigns the two
 *        highest non-Owner ranks as "editor ranks".
 *
 *   POST /api/communities/:id/permissions   body: { editorRanks: [n, n] }
 *     -> lets the community owner change which ranks can edit
 *        permissions.
 *
 * STORAGE
 *   KV  (binding SESSIONS)  — short-lived OAuth state/tickets, and
 *                             longer-lived session tokens (7 days).
 *   D1  (binding DB)        — communities table (see schema.sql).
 *
 * See SETUP.md for full deploy steps.
 */

const STATE_TTL_SECONDS = 300;
const TICKET_TTL_SECONDS = 60;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

// ---------- small helpers ----------

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data, status, env) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

function randomString(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64url(bytes.buffer);
}

function base64url(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Base64Url(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64url(digest);
}

function newId(prefix) {
  return `${prefix}_${randomString(12)}`;
}

/** Reads the session token from the Authorization header and resolves it via KV. */
async function requireSession(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const raw = await env.SESSIONS.get(`session:${match[1]}`);
  if (!raw) return null;
  return JSON.parse(raw);
}

// ---------- OAuth ----------

async function handleStart(request, env) {
  const codeVerifier = randomString(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const state = randomString(24);

  await env.SESSIONS.put(
    `oauth_state:${state}`,
    JSON.stringify({ codeVerifier, createdAt: Date.now() }),
    { expirationTtl: STATE_TTL_SECONDS }
  );

  const authUrl = new URL("https://apis.roblox.com/oauth/v1/authorize");
  authUrl.searchParams.set("client_id", env.ROBLOX_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", env.REDIRECT_URI);
  authUrl.searchParams.set("scope", "openid profile");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return Response.redirect(authUrl.toString(), 302);
}

async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  function redirectToLoginWithError(message) {
    const dest = new URL(env.SITE_URL.replace(/\/$/, "") + "/login.html");
    dest.searchParams.set("oauth_error", message);
    return Response.redirect(dest.toString(), 302);
  }

  if (oauthError) return redirectToLoginWithError(oauthError);
  if (!code || !state) return redirectToLoginWithError("missing_code_or_state");

  const stateKey = `oauth_state:${state}`;
  const stateRaw = await env.SESSIONS.get(stateKey);
  if (!stateRaw) return redirectToLoginWithError("state_expired");
  await env.SESSIONS.delete(stateKey);

  const { codeVerifier } = JSON.parse(stateRaw);

  const tokenRes = await fetch("https://apis.roblox.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.ROBLOX_CLIENT_ID,
      client_secret: env.ROBLOX_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: env.REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });
  if (!tokenRes.ok) return redirectToLoginWithError("token_exchange_failed");
  const tokens = await tokenRes.json();

  const userInfoRes = await fetch("https://apis.roblox.com/oauth/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userInfoRes.ok) return redirectToLoginWithError("userinfo_failed");
  const profile = await userInfoRes.json();

  const robloxUserId = String(profile.sub);
  const username = profile.preferred_username || profile.name;
  const displayName = profile.nickname || profile.name || username;
  const avatarUrl = profile.picture || null;

  // Create a session token now so the ticket exchange can hand it straight
  // to the browser — this is what authorizes /api/groups and /api/communities/*.
  const sessionToken = randomString(32);
  await env.SESSIONS.put(
    `session:${sessionToken}`,
    JSON.stringify({ robloxUserId, username, displayName, avatarUrl, createdAt: Date.now() }),
    { expirationTtl: SESSION_TTL_SECONDS }
  );

  const ticket = randomString(24);
  await env.SESSIONS.put(
    `ticket:${ticket}`,
    JSON.stringify({ robloxUserId, username, displayName, avatarUrl, sessionToken }),
    { expirationTtl: TICKET_TTL_SECONDS }
  );

  const dest = new URL(env.SITE_URL.replace(/\/$/, "") + "/login.html");
  dest.searchParams.set("ticket", ticket);
  return Response.redirect(dest.toString(), 302);
}

async function handleSession(request, env) {
  const url = new URL(request.url);
  const ticket = url.searchParams.get("ticket");
  if (!ticket) return json({ error: "missing ticket" }, 400, env);

  const key = `ticket:${ticket}`;
  const raw = await env.SESSIONS.get(key);
  if (!raw) return json({ error: "invalid or expired ticket" }, 404, env);

  await env.SESSIONS.delete(key);
  return json(JSON.parse(raw), 200, env);
}

// ---------- Roblox public API helpers ----------

async function fetchUserGroups(userId) {
  const res = await fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`);
  if (!res.ok) throw new Error("failed to fetch user's groups");
  const data = await res.json();
  return data.data || []; // [{ group: { id, name, memberCount }, role: { id, name, rank } }]
}

async function fetchGroupIcons(groupIds) {
  if (groupIds.length === 0) return {};
  const res = await fetch(
    `https://thumbnails.roblox.com/v1/groups/icons?groupIds=${groupIds.join(",")}&size=150x150&format=Png`
  );
  if (!res.ok) return {};
  const data = await res.json();
  const map = {};
  (data.data || []).forEach((entry) => { map[entry.targetId] = entry.imageUrl; });
  return map;
}

async function fetchGroupDetails(groupId) {
  const res = await fetch(`https://groups.roblox.com/v1/groups/${groupId}`);
  if (!res.ok) throw new Error("failed to fetch group details");
  return res.json(); // includes { owner: { userId, username, ... }, ... }
}

async function fetchGroupRoles(groupId) {
  const res = await fetch(`https://groups.roblox.com/v1/groups/${groupId}/roles`);
  if (!res.ok) throw new Error("failed to fetch group roles");
  const data = await res.json();
  return data.roles || []; // [{ id, name, rank, memberCount }]
}

// ---------- Groups + Communities endpoints ----------

async function handleGroups(request, env) {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "unauthorized" }, 401, env);

  let userGroups;
  try {
    userGroups = await fetchUserGroups(session.robloxUserId);
  } catch (e) {
    return json({ error: "failed to fetch groups from Roblox" }, 502, env);
  }

  const groupIds = userGroups.map((g) => String(g.group.id));
  const icons = await fetchGroupIcons(groupIds);

  let existingRows = [];
  if (groupIds.length > 0) {
    const placeholders = groupIds.map(() => "?").join(",");
    const stmt = env.DB.prepare(
      `SELECT id, roblox_group_id, group_name, group_icon_url, owner_roblox_user_id FROM communities WHERE roblox_group_id IN (${placeholders})`
    ).bind(...groupIds);
    const result = await stmt.all();
    existingRows = result.results || [];
  }
  const communityByGroupId = {};
  existingRows.forEach((row) => { communityByGroupId[row.roblox_group_id] = row; });

  const groups = userGroups.map((g) => {
    const groupId = String(g.group.id);
    const existing = communityByGroupId[groupId];
    return {
      groupId,
      groupName: g.group.name,
      memberCount: g.group.memberCount,
      iconUrl: icons[groupId] || null,
      rank: g.role.rank,
      roleName: g.role.name,
      isOwner: g.role.rank === 255,
      community: existing
        ? { id: existing.id, name: existing.group_name, iconUrl: existing.group_icon_url }
        : null,
    };
  });

  return json({ groups }, 200, env);
}

async function handleCreateCommunity(request, env) {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "unauthorized" }, 401, env);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "invalid JSON" }, 400, env); }
  const groupId = body && body.groupId ? String(body.groupId) : null;
  if (!groupId) return json({ error: "missing groupId" }, 400, env);

  const existing = await env.DB.prepare(
    "SELECT id FROM communities WHERE roblox_group_id = ?"
  ).bind(groupId).first();
  if (existing) return json({ error: "a community already exists for this group" }, 409, env);

  let groupDetails, roles;
  try {
    groupDetails = await fetchGroupDetails(groupId);
    roles = await fetchGroupRoles(groupId);
  } catch (e) {
    return json({ error: "failed to fetch group data from Roblox" }, 502, env);
  }

  const ownerUserId = groupDetails.owner && String(groupDetails.owner.userId);
  if (!ownerUserId || ownerUserId !== session.robloxUserId) {
    return json({ error: "only the group owner can create a community for this group" }, 403, env);
  }

  const icons = await fetchGroupIcons([groupId]);

  // Top 2 non-Owner ranks (Owner is rank 255 and always has full control)
  const editorRanks = roles
    .filter((r) => r.rank < 255)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 2)
    .map((r) => r.rank);

  const id = newId("com");
  await env.DB.prepare(
    `INSERT INTO communities (id, roblox_group_id, group_name, group_icon_url, owner_roblox_user_id, editor_ranks, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, groupId, groupDetails.name, icons[groupId] || null, ownerUserId, JSON.stringify(editorRanks), Date.now()).run();

  return json({
    id, groupId, name: groupDetails.name, iconUrl: icons[groupId] || null, editorRanks
  }, 201, env);
}

async function handleUpdatePermissions(request, env, communityId) {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "unauthorized" }, 401, env);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "invalid JSON" }, 400, env); }
  const editorRanks = Array.isArray(body && body.editorRanks) ? body.editorRanks.map(Number) : null;
  if (!editorRanks) return json({ error: "missing editorRanks array" }, 400, env);

  const row = await env.DB.prepare(
    "SELECT owner_roblox_user_id FROM communities WHERE id = ?"
  ).bind(communityId).first();
  if (!row) return json({ error: "community not found" }, 404, env);

  if (row.owner_roblox_user_id !== session.robloxUserId) {
    return json({ error: "only the community owner can change editor ranks" }, 403, env);
  }

  await env.DB.prepare("UPDATE communities SET editor_ranks = ? WHERE id = ?")
    .bind(JSON.stringify(editorRanks), communityId).run();

  return json({ id: communityId, editorRanks }, 200, env);
}

// ---------- router ----------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }

    if (url.pathname === "/api/oauth/start") return handleStart(request, env);
    if (url.pathname === "/api/oauth/callback") return handleCallback(request, env);
    if (url.pathname === "/api/oauth/session") return handleSession(request, env);

    if (url.pathname === "/api/groups" && request.method === "GET") return handleGroups(request, env);
    if (url.pathname === "/api/communities/create" && request.method === "POST") return handleCreateCommunity(request, env);

    const permMatch = url.pathname.match(/^\/api\/communities\/([^/]+)\/permissions$/);
    if (permMatch && request.method === "POST") return handleUpdatePermissions(request, env, permMatch[1]);

    return json({ error: "not found" }, 404, env);
  },
};
