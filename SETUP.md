# WaveLink — Real Roblox OAuth Setup

This wires up actual Roblox login: clicking "Continue with Roblox" sends
the user to Roblox's real sign-in/consent screen, and WaveLink gets back
their real username, display name, and profile picture. No Roblox game
needed for this approach.

Two things get deployed: your site (already on GitHub Pages) and one
small Cloudflare Worker that does the one step that *has* to happen on
a server — exchanging Roblox's authorization code for a token using
your Client Secret.

---

## 1. Register your app with Roblox

1. Go to https://create.roblox.com/dashboard/credentials
2. Create a new OAuth 2.0 app
3. Under **Permission Scopes**, add `openid` and `profile`
4. Under **Redirect URLs**, you'll add your Worker's callback URL —
   but you don't have it yet, so come back to this after step 2.
5. Copy the **Client ID** and **Client Secret** somewhere safe — Roblox
   only shows the secret once.

---

## 2. Deploy the Cloudflare Worker

You need a free Cloudflare account and Node.js installed.

```bash
npm install -g wrangler
wrangler login
```

From inside the `wavelink-worker` folder, create the KV namespace (for
OAuth state + session tokens):

```bash
wrangler kv namespace create SESSIONS
```

This prints an `id` — paste it into `wrangler.toml`, replacing
`REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.

Create the D1 database (this stores Communities — which Roblox groups
have a WaveLink community, who owns it, and which ranks can edit
permissions):

```bash
wrangler d1 create wavelink-db
```

This also prints a `database_id` — paste it into `wrangler.toml`,
replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`. Then apply the schema:

```bash
wrangler d1 execute wavelink-db --file=schema.sql
```

`ROBLOX_CLIENT_ID` is already filled in. Edit `wrangler.toml` and fill in:
- `SITE_URL` — your live GitHub Pages URL, e.g. `https://nexusvoids.github.io/Wave-Link`
- `ALLOWED_ORIGIN` — usually the same origin, e.g. `https://nexusvoids.github.io`
- `REDIRECT_URI` — leave the placeholder for now, you'll fix it after your first deploy

Set the client secret (never goes in `wrangler.toml`):

```bash
wrangler secret put ROBLOX_CLIENT_SECRET
```

Deploy:

```bash
wrangler deploy
```

Wrangler prints your Worker's URL, e.g.
`https://wavelink-verify.yourname.workers.dev`.

Now:
- Update `REDIRECT_URI` in `wrangler.toml` to
  `https://wavelink-verify.yourname.workers.dev/api/oauth/callback`
  and run `wrangler deploy` again.
- Go back to your Roblox app's **Redirect URLs** (step 1) and add that
  exact same callback URL.

---

## 3. Point the website at your Worker

Open `auth-demo.js` and `communities.js` and set the same value in both:

```js
var WORKER_URL = "https://wavelink-verify.yourname.workers.dev";
```

Push the updated files to GitHub Pages. Now:

1. **"Continue with Roblox"** on `login.html` sends the user to Roblox's
   real login/consent screen, then back through the Worker, landing on
   `dashboard.html` with their real username, display name, and avatar.
2. The **Communities** page (`communities.html`) calls `/api/groups`,
   which lists every Roblox group the logged-in user belongs to, with
   icon, member count, and their rank — cross-checked against your D1
   database to show which ones already have a WaveLink community.
3. If the user is the **Roblox Group Owner**, they see a "Create
   Community" button. Clicking it calls `/api/communities/create`,
   which double-checks ownership directly against Roblox's Group API
   (not just trusting the click) before creating the row in D1. It
   also automatically assigns the **top 2 non-Owner ranks** in that
   group as "editor ranks" (stored in `editor_ranks`, adjustable later
   via `/api/communities/:id/permissions`).

---

## Notes

- The Client Secret only ever lives in Cloudflare (set via `wrangler
  secret put`) — it's never in any file you upload to GitHub, and never
  reaches the browser.
- **You pasted your Client ID and Secret in a chat conversation.** The
  Client ID is fine — it's not sensitive. The Secret is not — treat it
  as compromised. Go to `create.roblox.com/dashboard/credentials`,
  generate a new one, and run `wrangler secret put ROBLOX_CLIENT_SECRET`
  again with the new value before you rely on this for anything real.
- This flow also uses PKCE (a code verifier/challenge pair) as an extra
  layer on top of the Client Secret, matching Roblox's own
  recommendation for all clients.
- Every group/community API call requires a `sessionToken` (issued at
  login, valid 7 days, sent as `Authorization: Bearer ...`). This is
  what stops someone from calling `/api/communities/create` and
  claiming to be a group owner they aren't — the Worker always
  re-verifies ownership against Roblox's own Group API regardless of
  what the browser claims.
- Not built yet, and worth knowing that: moderation tools and session
  hosting (the features you described WaveLink communities having)
  aren't part of this piece — this covers identity + the
  group-ownership-gated community record only. Those would be their
  own set of endpoints and D1 tables on top of this same Worker.
