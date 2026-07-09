import { getDatabase } from "@/lib/db";
import type { MailFolderId } from "@/lib/folders";
import type { EmailSummary } from "@/lib/types";

let schemaReady = false;

function migrateLegacyMailCacheSchema(db: ReturnType<typeof getDatabase>): void {
  const columns = db
    .prepare("PRAGMA table_info(cached_messages)")
    .all() as Array<{ name: string }>;

  if (!columns.some((column) => column.name === "synced_at")) {
    return;
  }

  db.exec(`
    CREATE TABLE cached_messages_migrated (
      account_id TEXT NOT NULL,
      folder TEXT NOT NULL,
      uid INTEGER NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      from_addr TEXT NOT NULL DEFAULT '',
      to_addr TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      seen INTEGER NOT NULL DEFAULT 0,
      answered INTEGER NOT NULL DEFAULT 0,
      has_attachments INTEGER NOT NULL DEFAULT 0,
      snippet TEXT NOT NULL DEFAULT '',
      account_email TEXT NOT NULL DEFAULT '',
      account_name TEXT NOT NULL DEFAULT '',
      account_color TEXT NOT NULL DEFAULT '#3b82f6',
      PRIMARY KEY (account_id, folder, uid)
    );

    INSERT INTO cached_messages_migrated (
      account_id, folder, uid, subject, from_addr, to_addr, date,
      seen, answered, has_attachments, snippet,
      account_email, account_name, account_color
    )
    SELECT
      account_id, folder, uid, subject, from_addr, to_addr, date,
      seen, answered, has_attachments, snippet,
      account_email, account_name, account_color
    FROM cached_messages;

    DROP TABLE cached_messages;
    ALTER TABLE cached_messages_migrated RENAME TO cached_messages;

    CREATE INDEX IF NOT EXISTS idx_cached_messages_list
      ON cached_messages (folder, date DESC);

    CREATE INDEX IF NOT EXISTS idx_cached_messages_account_folder
      ON cached_messages (account_id, folder, date DESC);
  `);
}

function ensureMailCacheSchema(): void {
  if (schemaReady) return;

  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS cached_messages (
      account_id TEXT NOT NULL,
      folder TEXT NOT NULL,
      uid INTEGER NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      from_addr TEXT NOT NULL DEFAULT '',
      to_addr TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      seen INTEGER NOT NULL DEFAULT 0,
      answered INTEGER NOT NULL DEFAULT 0,
      has_attachments INTEGER NOT NULL DEFAULT 0,
      snippet TEXT NOT NULL DEFAULT '',
      account_email TEXT NOT NULL DEFAULT '',
      account_name TEXT NOT NULL DEFAULT '',
      account_color TEXT NOT NULL DEFAULT '#3b82f6',
      PRIMARY KEY (account_id, folder, uid)
    );

    CREATE INDEX IF NOT EXISTS idx_cached_messages_list
      ON cached_messages (folder, date DESC);

    CREATE INDEX IF NOT EXISTS idx_cached_messages_account_folder
      ON cached_messages (account_id, folder, date DESC);

    CREATE TABLE IF NOT EXISTS cached_messages_sync (
      account_id TEXT NOT NULL,
      folder TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      PRIMARY KEY (account_id, folder)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS cached_messages_fts USING fts5(
      account_id UNINDEXED,
      folder UNINDEXED,
      uid UNINDEXED,
      subject,
      from_addr,
      to_addr,
      snippet,
      body_text,
      tokenize = 'unicode61'
    );
  `);

  migrateLegacyMailCacheSchema(db);
  migrateFtsBodyTextColumn(db);
  backfillFtsBodiesFromDetails(db);

  schemaReady = true;
}

function migrateFtsBodyTextColumn(db: ReturnType<typeof getDatabase>): void {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'cached_messages_fts'"
    )
    .get() as { sql: string } | undefined;

  if (!row?.sql || row.sql.includes("body_text")) return;

  db.exec(`
    CREATE VIRTUAL TABLE cached_messages_fts_v2 USING fts5(
      account_id UNINDEXED,
      folder UNINDEXED,
      uid UNINDEXED,
      subject,
      from_addr,
      to_addr,
      snippet,
      body_text,
      tokenize = 'unicode61'
    );

    INSERT INTO cached_messages_fts_v2 (
      account_id, folder, uid, subject, from_addr, to_addr, snippet, body_text
    )
    SELECT account_id, folder, uid, subject, from_addr, to_addr, snippet, ''
    FROM cached_messages_fts;

    DROP TABLE cached_messages_fts;
    ALTER TABLE cached_messages_fts_v2 RENAME TO cached_messages_fts;
  `);
}

function backfillFtsBodiesFromDetails(db: ReturnType<typeof getDatabase>): void {
  const detailsTable = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cached_message_details'"
    )
    .get();
  if (!detailsTable) return;

  const rows = db
    .prepare(
      `SELECT account_id, folder, uid, subject, from_addr, to_addr, snippet,
              text_body, html_body
       FROM cached_message_details`
    )
    .all() as Array<Record<string, unknown>>;

  for (const row of rows) {
    const bodyText = extractSearchableBody(
      (row.text_body as string) || undefined,
      (row.html_body as string) || undefined
    );
    if (!bodyText) continue;

    const accountId = row.account_id as string;
    const folder = row.folder as MailFolderId;
    const uid = row.uid as number;

    deleteFtsRow(accountId, folder, uid);
    insertFtsRow(
      accountId,
      folder,
      uid,
      (row.subject as string) || "",
      (row.from_addr as string) || "",
      (row.to_addr as string) || "",
      (row.snippet as string) || "",
      bodyText
    );
  }
}

function rowToEmailSummary(row: Record<string, unknown>): EmailSummary {
  return {
    uid: row.uid as number,
    accountId: row.account_id as string,
    accountEmail: row.account_email as string,
    accountName: row.account_name as string,
    accountColor: row.account_color as string,
    subject: row.subject as string,
    from: row.from_addr as string,
    to: (row.to_addr as string) || undefined,
    date: row.date as string,
    seen: Boolean(row.seen),
    answered: Boolean(row.answered),
    hasAttachments: Boolean(row.has_attachments),
    snippet: row.snippet as string,
    folder: row.folder as string,
  };
}

function extractSearchableBody(
  text?: string,
  html?: string
): string {
  if (text?.trim()) return text.trim().slice(0, 100_000);
  if (!html?.trim()) return "";

  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100_000);
}

function buildFtsQuery(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  if (trimmed.includes("@")) {
    return `"${trimmed.replace(/"/g, '""')}"`;
  }

  const terms = trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"*`);

  return terms.length > 0 ? terms.join(" ") : null;
}

function buildLikePattern(query: string): string {
  return `%${query
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")}%`;
}

function summaryKey(row: Record<string, unknown>): string {
  return `${row.account_id}:${row.folder}:${row.uid}`;
}

function deleteFtsRow(
  accountId: string,
  folder: MailFolderId,
  uid: number
): void {
  getDatabase()
    .prepare(
      "DELETE FROM cached_messages_fts WHERE account_id = ? AND folder = ? AND uid = ?"
    )
    .run(accountId, folder, uid);
}

function insertFtsRow(
  accountId: string,
  folder: MailFolderId,
  uid: number,
  subject: string,
  from: string,
  to: string,
  snippet: string,
  bodyText = ""
): void {
  getDatabase()
    .prepare(
      `INSERT INTO cached_messages_fts (
        account_id, folder, uid, subject, from_addr, to_addr, snippet, body_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(accountId, folder, uid, subject, from, to, snippet, bodyText);
}

function upsertMessageRow(email: EmailSummary, folder: MailFolderId): void {
  getDatabase()
    .prepare(
      `INSERT INTO cached_messages (
        account_id, folder, uid, subject, from_addr, to_addr, date,
        seen, answered, has_attachments, snippet,
        account_email, account_name, account_color
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (account_id, folder, uid) DO UPDATE SET
        subject = excluded.subject,
        from_addr = excluded.from_addr,
        to_addr = excluded.to_addr,
        date = excluded.date,
        seen = excluded.seen,
        answered = excluded.answered,
        has_attachments = excluded.has_attachments,
        snippet = excluded.snippet,
        account_email = excluded.account_email,
        account_name = excluded.account_name,
        account_color = excluded.account_color`
    )
    .run(
      email.accountId,
      folder,
      email.uid,
      email.subject,
      email.from,
      email.to ?? "",
      email.date,
      email.seen ? 1 : 0,
      email.answered ? 1 : 0,
      email.hasAttachments ? 1 : 0,
      email.snippet,
      email.accountEmail,
      email.accountName,
      email.accountColor ?? "#3b82f6"
    );

  deleteFtsRow(email.accountId, folder, email.uid);
  insertFtsRow(
    email.accountId,
    folder,
    email.uid,
    email.subject,
    email.from,
    email.to ?? "",
    email.snippet
  );
}

export function indexMessageBodyForSearch(
  accountId: string,
  folder: MailFolderId,
  uid: number,
  fields: {
    subject: string;
    from: string;
    to: string;
    snippet: string;
    text?: string;
    html?: string;
  }
): void {
  ensureMailCacheSchema();
  const bodyText = extractSearchableBody(fields.text, fields.html);
  if (!bodyText) return;

  deleteFtsRow(accountId, folder, uid);
  insertFtsRow(
    accountId,
    folder,
    uid,
    fields.subject,
    fields.from,
    fields.to,
    fields.snippet,
    bodyText
  );
}

export function replaceCachedMessages(
  accountId: string,
  folder: MailFolderId,
  emails: EmailSummary[]
): void {
  ensureMailCacheSchema();
  const db = getDatabase();

  const tx = db.transaction(() => {
    db.prepare(
      "DELETE FROM cached_messages WHERE account_id = ? AND folder = ?"
    ).run(accountId, folder);
    db.prepare(
      "DELETE FROM cached_messages_fts WHERE account_id = ? AND folder = ?"
    ).run(accountId, folder);

    for (const email of emails) {
      upsertMessageRow(email, folder);
    }

    db.prepare(
      `INSERT INTO cached_messages_sync (account_id, folder, synced_at)
       VALUES (?, ?, ?)
       ON CONFLICT (account_id, folder) DO UPDATE SET synced_at = excluded.synced_at`
    ).run(accountId, folder, new Date().toISOString());
  });

  tx();
}

export function mergeCachedMessages(
  accountId: string,
  folder: MailFolderId,
  emails: EmailSummary[]
): void {
  ensureMailCacheSchema();
  if (emails.length === 0) return;

  const db = getDatabase();
  const tx = db.transaction(() => {
    for (const email of emails) {
      upsertMessageRow(email, folder);
    }
  });
  tx();
}

export function mergeCachedSearchResults(emails: EmailSummary[]): void {
  ensureMailCacheSchema();
  const byKey = new Map<string, EmailSummary[]>();

  for (const email of emails) {
    const folder = (email.folder ?? "inbox") as MailFolderId;
    const key = `${email.accountId}:${folder}`;
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.push(email);
    } else {
      byKey.set(key, [email]);
    }
  }

  for (const [key, bucket] of byKey) {
    const [accountId, folder] = key.split(":") as [string, MailFolderId];
    mergeCachedMessages(accountId, folder, bucket);
  }
}

export function listCachedMessages(
  accountIds: string[],
  folder: MailFolderId,
  options: { limit?: number; unreadOnly?: boolean; offset?: number } = {}
): EmailSummary[] {
  ensureMailCacheSchema();
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const unreadOnly = options.unreadOnly ?? false;

  if (accountIds.length === 0) return [];

  const placeholders = accountIds.map(() => "?").join(", ");
  let sql = `
    SELECT
      m.account_id,
      m.folder,
      m.uid,
      m.subject,
      m.from_addr,
      m.to_addr,
      m.date,
      m.seen,
      m.answered,
      m.has_attachments,
      COALESCE(NULLIF(m.snippet, ''), d.snippet, '') AS snippet,
      m.account_email,
      m.account_name,
      m.account_color
    FROM cached_messages m
    LEFT JOIN cached_message_details d
      ON m.account_id = d.account_id
     AND m.folder = d.folder
     AND m.uid = d.uid
    WHERE m.folder = ? AND m.account_id IN (${placeholders})
  `;
  const params: unknown[] = [folder, ...accountIds];

  if (unreadOnly) {
    sql += " AND m.seen = 0";
  }

  sql += " ORDER BY m.date DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const rows = getDatabase()
    .prepare(sql)
    .all(...params) as Record<string, unknown>[];

  return rows.map(rowToEmailSummary);
}

export function searchCachedMessages(
  accountIds: string[],
  query: string,
  limit: number
): EmailSummary[] {
  ensureMailCacheSchema();
  const trimmed = query.trim();
  if (!trimmed || accountIds.length === 0) return [];

  const placeholders = accountIds.map(() => "?").join(", ");
  const seen = new Set<string>();
  const results: EmailSummary[] = [];

  const addRows = (rows: Record<string, unknown>[]) => {
    for (const row of rows) {
      const key = summaryKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(rowToEmailSummary(row));
      if (results.length >= limit) break;
    }
  };

  const ftsQuery = buildFtsQuery(trimmed);
  if (ftsQuery) {
    const ftsRows = getDatabase()
      .prepare(
        `SELECT m.* FROM cached_messages m
         INNER JOIN cached_messages_fts
           ON m.account_id = cached_messages_fts.account_id
          AND m.folder = cached_messages_fts.folder
          AND m.uid = cached_messages_fts.uid
         WHERE cached_messages_fts MATCH ?
           AND m.account_id IN (${placeholders})
         ORDER BY m.date DESC
         LIMIT ?`
      )
      .all(ftsQuery, ...accountIds, limit) as Record<string, unknown>[];
    addRows(ftsRows);
  }

  if (results.length < limit) {
    const likePattern = buildLikePattern(trimmed);
    const likeRows = getDatabase()
      .prepare(
        `SELECT DISTINCT m.* FROM cached_messages m
         LEFT JOIN cached_message_details d
           ON m.account_id = d.account_id
          AND m.folder = d.folder
          AND m.uid = d.uid
         WHERE m.account_id IN (${placeholders})
           AND (
             m.subject LIKE ? ESCAPE '\\'
             OR m.from_addr LIKE ? ESCAPE '\\'
             OR m.to_addr LIKE ? ESCAPE '\\'
             OR m.snippet LIKE ? ESCAPE '\\'
             OR d.text_body LIKE ? ESCAPE '\\'
             OR d.html_body LIKE ? ESCAPE '\\'
           )
         ORDER BY m.date DESC
         LIMIT ?`
      )
      .all(
        ...accountIds,
        likePattern,
        likePattern,
        likePattern,
        likePattern,
        likePattern,
        likePattern,
        limit - results.length
      ) as Record<string, unknown>[];
    addRows(likeRows);
  }

  return results;
}

export function hasSearchableCache(accountIds: string[]): boolean {
  ensureMailCacheSchema();
  if (accountIds.length === 0) return false;

  const placeholders = accountIds.map(() => "?").join(", ");
  const row = getDatabase()
    .prepare(
      `SELECT 1 AS ok FROM cached_messages
       WHERE account_id IN (${placeholders})
       LIMIT 1`
    )
    .get(...accountIds);

  return row != null;
}

export function getCacheSyncTime(
  accountId: string,
  folder: MailFolderId
): string | null {
  ensureMailCacheSchema();
  const row = getDatabase()
    .prepare(
      "SELECT synced_at FROM cached_messages_sync WHERE account_id = ? AND folder = ?"
    )
    .get(accountId, folder) as { synced_at: string } | undefined;

  return row?.synced_at ?? null;
}

export function updateCachedMessageSeen(
  accountId: string,
  folder: MailFolderId,
  uid: number,
  seen: boolean
): void {
  ensureMailCacheSchema();
  getDatabase()
    .prepare(
      "UPDATE cached_messages SET seen = ? WHERE account_id = ? AND folder = ? AND uid = ?"
    )
    .run(seen ? 1 : 0, accountId, folder, uid);
}

export function deleteCachedMessage(
  accountId: string,
  folder: MailFolderId,
  uid: number
): void {
  ensureMailCacheSchema();
  const db = getDatabase();
  const tx = db.transaction(() => {
    db.prepare(
      "DELETE FROM cached_messages WHERE account_id = ? AND folder = ? AND uid = ?"
    ).run(accountId, folder, uid);
    deleteFtsRow(accountId, folder, uid);
  });
  tx();
}

export function clearCachedMessagesForAccount(accountId: string): void {
  ensureMailCacheSchema();
  const db = getDatabase();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM cached_messages WHERE account_id = ?").run(
      accountId
    );
    db.prepare("DELETE FROM cached_messages_fts WHERE account_id = ?").run(
      accountId
    );
    db.prepare("DELETE FROM cached_messages_sync WHERE account_id = ?").run(
      accountId
    );
  });
  tx();
}
