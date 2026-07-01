import { getDatabase } from "@/lib/db";
import { indexMessageBodyForSearch } from "@/lib/mail-cache-db";
import type { MailFolderId } from "@/lib/folders";
import type { EmailAttachment, EmailDetail } from "@/lib/types";

let schemaReady = false;

function ensureMailDetailCacheSchema(): void {
  if (schemaReady) return;

  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS cached_message_details (
      account_id TEXT NOT NULL,
      folder TEXT NOT NULL,
      uid INTEGER NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      from_addr TEXT NOT NULL DEFAULT '',
      to_addr TEXT NOT NULL DEFAULT '',
      cc TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      seen INTEGER NOT NULL DEFAULT 0,
      answered INTEGER NOT NULL DEFAULT 0,
      has_attachments INTEGER NOT NULL DEFAULT 0,
      snippet TEXT NOT NULL DEFAULT '',
      text_body TEXT,
      html_body TEXT,
      reply_to_header TEXT,
      original_from_header TEXT,
      attachments_json TEXT NOT NULL DEFAULT '[]',
      account_email TEXT NOT NULL DEFAULT '',
      account_name TEXT NOT NULL DEFAULT '',
      account_color TEXT NOT NULL DEFAULT '#3b82f6',
      cached_at TEXT NOT NULL,
      PRIMARY KEY (account_id, folder, uid)
    );

    CREATE INDEX IF NOT EXISTS idx_cached_message_details_cached_at
      ON cached_message_details (cached_at DESC);
  `);

  schemaReady = true;
}

function rowToEmailDetail(row: Record<string, unknown>): EmailDetail {
  let attachments: EmailAttachment[] = [];
  try {
    attachments = JSON.parse((row.attachments_json as string) || "[]");
  } catch {
    attachments = [];
  }

  return {
    uid: row.uid as number,
    accountId: row.account_id as string,
    accountEmail: row.account_email as string,
    accountName: row.account_name as string,
    accountColor: row.account_color as string,
    subject: row.subject as string,
    from: row.from_addr as string,
    to: row.to_addr as string,
    cc: (row.cc as string) || undefined,
    replyToHeader: (row.reply_to_header as string) || undefined,
    originalFromHeader: (row.original_from_header as string) || undefined,
    date: row.date as string,
    seen: Boolean(row.seen),
    answered: Boolean(row.answered),
    hasAttachments: Boolean(row.has_attachments),
    attachments,
    snippet: row.snippet as string,
    text: (row.text_body as string) || undefined,
    html: (row.html_body as string) || undefined,
    folder: row.folder as string,
  };
}

export function getCachedMessageDetail(
  accountId: string,
  folder: MailFolderId,
  uid: number
): EmailDetail | null {
  ensureMailDetailCacheSchema();
  const row = getDatabase()
    .prepare(
      `SELECT *, folder FROM cached_message_details
       WHERE account_id = ? AND folder = ? AND uid = ?`
    )
    .get(accountId, folder, uid) as Record<string, unknown> | undefined;

  return row ? rowToEmailDetail(row) : null;
}

export function setCachedMessageDetail(
  detail: EmailDetail,
  folder: MailFolderId
): void {
  ensureMailDetailCacheSchema();

  getDatabase()
    .prepare(
      `INSERT INTO cached_message_details (
        account_id, folder, uid, subject, from_addr, to_addr, cc, date,
        seen, answered, has_attachments, snippet, text_body, html_body,
        reply_to_header, original_from_header, attachments_json,
        account_email, account_name, account_color, cached_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (account_id, folder, uid) DO UPDATE SET
        subject = excluded.subject,
        from_addr = excluded.from_addr,
        to_addr = excluded.to_addr,
        cc = excluded.cc,
        date = excluded.date,
        seen = excluded.seen,
        answered = excluded.answered,
        has_attachments = excluded.has_attachments,
        snippet = excluded.snippet,
        text_body = excluded.text_body,
        html_body = excluded.html_body,
        reply_to_header = excluded.reply_to_header,
        original_from_header = excluded.original_from_header,
        attachments_json = excluded.attachments_json,
        account_email = excluded.account_email,
        account_name = excluded.account_name,
        account_color = excluded.account_color,
        cached_at = excluded.cached_at`
    )
    .run(
      detail.accountId,
      folder,
      detail.uid,
      detail.subject,
      detail.from,
      detail.to,
      detail.cc ?? "",
      detail.date,
      detail.seen ? 1 : 0,
      detail.answered ? 1 : 0,
      detail.hasAttachments ? 1 : 0,
      detail.snippet,
      detail.text ?? null,
      detail.html ?? null,
      detail.replyToHeader ?? null,
      detail.originalFromHeader ?? null,
      JSON.stringify(detail.attachments ?? []),
      detail.accountEmail,
      detail.accountName,
      detail.accountColor ?? "#3b82f6",
      new Date().toISOString()
    );

  indexMessageBodyForSearch(detail.accountId, folder, detail.uid, {
    subject: detail.subject,
    from: detail.from,
    to: detail.to,
    snippet: detail.snippet,
    text: detail.text,
    html: detail.html,
  });
}

export function updateCachedMessageDetailSeen(
  accountId: string,
  folder: MailFolderId,
  uid: number,
  seen: boolean
): void {
  ensureMailDetailCacheSchema();
  getDatabase()
    .prepare(
      "UPDATE cached_message_details SET seen = ? WHERE account_id = ? AND folder = ? AND uid = ?"
    )
    .run(seen ? 1 : 0, accountId, folder, uid);
}

export function deleteCachedMessageDetail(
  accountId: string,
  folder: MailFolderId,
  uid: number
): void {
  ensureMailDetailCacheSchema();
  getDatabase()
    .prepare(
      "DELETE FROM cached_message_details WHERE account_id = ? AND folder = ? AND uid = ?"
    )
    .run(accountId, folder, uid);
}

export function clearCachedMessageDetailsForAccount(accountId: string): void {
  ensureMailDetailCacheSchema();
  getDatabase()
    .prepare("DELETE FROM cached_message_details WHERE account_id = ?")
    .run(accountId);
}
