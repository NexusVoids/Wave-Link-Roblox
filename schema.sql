-- WaveLink — Communities schema (Cloudflare D1 / SQLite)
-- Apply with: wrangler d1 execute wavelink-db --file=schema.sql

CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,                     -- random id, e.g. "com_XXXXXXXX"
  roblox_group_id TEXT UNIQUE NOT NULL,    -- the Roblox group this community is tied to
  group_name TEXT NOT NULL,
  group_icon_url TEXT,
  owner_roblox_user_id TEXT NOT NULL,      -- the group Owner who created the community
  editor_ranks TEXT NOT NULL DEFAULT '[]', -- JSON array of rank numbers allowed to edit permissions, e.g. "[200,150]"
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_communities_group_id ON communities (roblox_group_id);
