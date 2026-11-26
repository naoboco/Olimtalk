import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const file = process.env.DB_FILE || path.join(DATA_DIR, 'olimtalk.db');
export const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  avatar        TEXT,
  bio           TEXT NOT NULL DEFAULT '',
  profile       TEXT,
  city          TEXT,
  world         TEXT NOT NULL DEFAULT 'fr',
  aliyah_year   INTEGER,
  is_system     INTEGER NOT NULL DEFAULT 0,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  banned        INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  last_seen     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS communities (
  id           INTEGER PRIMARY KEY,
  world        TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  emoji        TEXT NOT NULL DEFAULT '🌍',
  avatar       TEXT,
  invite_code  TEXT NOT NULL UNIQUE,
  seed_key     TEXT UNIQUE,                -- stable key of built-in communities
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  member_count INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS communities_world ON communities(world, member_count DESC);

CREATE TABLE IF NOT EXISTS community_members (
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member',
  joined_at    INTEGER NOT NULL,
  PRIMARY KEY (community_id, user_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS community_members_user ON community_members(user_id);

CREATE TABLE IF NOT EXISTS chats (
  id              INTEGER PRIMARY KEY,
  type            TEXT NOT NULL,              -- 'group' | 'dm'
  world           TEXT,
  name            TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  emoji           TEXT NOT NULL DEFAULT '💬',
  avatar          TEXT,
  category        TEXT NOT NULL DEFAULT 'general',
  city            TEXT,
  profile         TEXT,
  community_id    INTEGER REFERENCES communities(id) ON DELETE SET NULL,
  is_announcement INTEGER NOT NULL DEFAULT 0,
  invite_code     TEXT UNIQUE,
  dm_key          TEXT UNIQUE,
  seed_key        TEXT UNIQUE,             -- stable key of built-in groups
  send_policy     TEXT NOT NULL DEFAULT 'all',
  pin_policy      TEXT NOT NULL DEFAULT 'admins',
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  member_count    INTEGER NOT NULL DEFAULT 0,
  last_message_id INTEGER,
  last_activity   INTEGER NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chats_explore ON chats(type, world, category, member_count DESC);
CREATE INDEX IF NOT EXISTS chats_community ON chats(community_id);

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id      INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member',
  joined_at    INTEGER NOT NULL,
  last_read_id INTEGER NOT NULL DEFAULT 0,
  muted        INTEGER NOT NULL DEFAULT 0,
  pinned       INTEGER NOT NULL DEFAULT 0,
  archived     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_id, user_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS chat_members_user ON chat_members(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id     INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'text',
  text        TEXT NOT NULL DEFAULT '',
  attachment  TEXT,
  meta        TEXT,
  reply_to_id INTEGER,
  forwarded   INTEGER NOT NULL DEFAULT 0,
  edited_at   INTEGER,
  deleted_at  INTEGER,
  pinned_at   INTEGER,
  pinned_by   INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_chat ON messages(chat_id, id);
CREATE INDEX IF NOT EXISTS messages_pinned ON messages(chat_id, pinned_at) WHERE pinned_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS reactions (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS stars (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, message_id)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS hidden_messages (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, message_id)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS poll_votes (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_idx INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id, option_idx)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY,
  chat_id     INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  world       TEXT,
  message_id  INTEGER,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  location    TEXT NOT NULL DEFAULT '',
  starts_at   INTEGER NOT NULL,
  ends_at     INTEGER,
  created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_world ON events(world, starts_at);

CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status   TEXT NOT NULL,
  PRIMARY KEY (event_id, user_id)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS stories (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  world      TEXT NOT NULL,
  type       TEXT NOT NULL,
  text       TEXT NOT NULL DEFAULT '',
  bg         TEXT NOT NULL DEFAULT '',
  media      TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS stories_world ON stories(world, expires_at);
CREATE INDEX IF NOT EXISTS stories_user ON stories(user_id, expires_at);

CREATE TABLE IF NOT EXISTS story_views (
  story_id  INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at INTEGER NOT NULL,
  PRIMARY KEY (story_id, user_id)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS blocks (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, blocked_id)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id   INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  details     TEXT NOT NULL DEFAULT '',
  snapshot    TEXT NOT NULL DEFAULT '',   -- the reported text as it was, for the moderators
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  INTEGER NOT NULL
);
`);

// People who asked to enter a private group and wait for an administrator's answer.
db.exec(`
CREATE TABLE IF NOT EXISTS join_requests (
  chat_id    INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, user_id)
);
`);

// Translations of public messages, kept so that each one is paid for once per language.
// `text` is NULL when the message needed no translation into that language.
db.exec(`
CREATE TABLE IF NOT EXISTS translations (
  message_id  INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  lang        TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  text        TEXT,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (message_id, lang)
);
`);

// Columns added after the first release (CREATE TABLE IF NOT EXISTS does not add them).
function addColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
addColumn('reports', 'snapshot', "TEXT NOT NULL DEFAULT ''");
// End-to-end encryption: public key, private key wrapped with a key only the person can derive.
addColumn('users', 'e2e_public', 'TEXT');
addColumn('users', 'e2e_private', 'TEXT');
// Settings vault (AI key, calendar links…): ciphertext the server cannot read.
addColumn('users', 'vault', 'TEXT');
// Privacy choices.
addColumn('users', 'hide_presence', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'no_receipts', 'INTEGER NOT NULL DEFAULT 0');
// Private groups: entering needs an administrator's agreement and only members read them.
// `listed` says whether people can find the group (name and description) to ask.
addColumn('chats', 'private', 'INTEGER NOT NULL DEFAULT 0');
addColumn('chats', 'listed', 'INTEGER NOT NULL DEFAULT 1');
// Automatic translation: on unless switched off (NULL = not chosen yet), private messages
// only when asked for, and the other languages the person reads without help.
addColumn('users', 'auto_translate', 'INTEGER');
addColumn('users', 'translate_private', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'read_langs', "TEXT NOT NULL DEFAULT ''");
// Secret tokens of the personal calendar feed and of the forwarding e-mail address.
addColumn('users', 'cal_token', 'TEXT');
addColumn('users', 'mail_token', 'TEXT');
// Ciphertext of an encrypted (private) message; `text` is then empty.
addColumn('messages', 'enc', 'TEXT');
// Connected devices.
addColumn('sessions', 'id', 'TEXT');
addColumn('sessions', 'user_agent', "TEXT NOT NULL DEFAULT ''");
addColumn('sessions', 'last_used', 'INTEGER NOT NULL DEFAULT 0');

db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS users_cal_token ON users(cal_token) WHERE cal_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_mail_token ON users(mail_token) WHERE mail_token IS NOT NULL;

-- E-mails forwarded to a person's private OlimTalk address. Both the summary and the
-- body are sealed with the recipient's public key on arrival: the server cannot read them.
CREATE TABLE IF NOT EXISTS emails (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  received_at INTEGER NOT NULL,
  size        INTEGER NOT NULL,
  header      TEXT NOT NULL,      -- sealed: from, subject, date, snippet
  body        TEXT NOT NULL,      -- /uploads/… of the sealed body and attachments
  read        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS emails_user ON emails(user_id, id);
`);

// ---- row types ----
export interface UserRow {
  id: number;
  email: string;
  username: string;
  password_hash: string;
  name: string;
  avatar: string | null;
  bio: string;
  profile: string | null;
  city: string | null;
  world: string;
  aliyah_year: number | null;
  is_system: number;
  is_admin: number;
  banned: number;
  created_at: number;
  last_seen: number;
  e2e_public: string | null;
  e2e_private: string | null;
  vault: string | null;
  hide_presence: number;
  no_receipts: number;
  auto_translate: number | null;
  translate_private: number;
  read_langs: string;
  cal_token: string | null;
  mail_token: string | null;
}

export interface ChatRow {
  id: number;
  type: 'group' | 'dm';
  world: string | null;
  name: string;
  description: string;
  emoji: string;
  avatar: string | null;
  category: string;
  city: string | null;
  profile: string | null;
  community_id: number | null;
  is_announcement: number;
  invite_code: string | null;
  dm_key: string | null;
  seed_key: string | null;
  send_policy: 'all' | 'admins';
  pin_policy: 'all' | 'admins';
  created_by: number | null;
  member_count: number;
  last_message_id: number | null;
  last_activity: number;
  created_at: number;
  private: number;
  listed: number;
}

export interface MemberRow {
  chat_id: number;
  user_id: number;
  role: 'owner' | 'admin' | 'member';
  joined_at: number;
  last_read_id: number;
  muted: number;
  pinned: number;
  archived: number;
}

export interface MessageRow {
  id: number;
  chat_id: number;
  user_id: number;
  type: string;
  text: string;
  attachment: string | null;
  meta: string | null;
  reply_to_id: number | null;
  forwarded: number;
  edited_at: number | null;
  deleted_at: number | null;
  pinned_at: number | null;
  pinned_by: number | null;
  created_at: number;
  enc: string | null;
}

export interface CommunityRow {
  id: number;
  world: string;
  name: string;
  description: string;
  emoji: string;
  avatar: string | null;
  invite_code: string;
  seed_key: string | null;
  created_by: number | null;
  member_count: number;
  created_at: number;
}

export interface EventRow {
  id: number;
  chat_id: number;
  world: string | null;
  message_id: number | null;
  title: string;
  description: string;
  location: string;
  starts_at: number;
  ends_at: number | null;
  created_by: number;
  created_at: number;
}

export interface StoryRow {
  id: number;
  user_id: number;
  world: string;
  type: 'text' | 'image' | 'video';
  text: string;
  bg: string;
  media: string | null;
  created_at: number;
  expires_at: number;
}

/** Build "?,?,?" for IN clauses. */
export function qs(n: number): string {
  return Array.from({ length: n }, () => '?').join(',');
}

export const tx = <T>(fn: () => T): T => db.transaction(fn)();
