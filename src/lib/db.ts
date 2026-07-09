import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { mkdirSync } from "fs";
import { join } from "path";
import { decrypt, encrypt } from "./crypto";
import type { MailAccount, MailAccountInput, MailAccountUpdate } from "./types";
import { pickAccountColor } from "./account-colors";

const DATA_DIR = join(process.cwd(), "data");
const DB_PATH = join(DATA_DIR, "mailer.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    mkdirSync(DATA_DIR, { recursive: true });
    const instance = new Database(DB_PATH);
    instance.pragma("journal_mode = WAL");
    instance.pragma("foreign_keys = ON");
    instance.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_enc TEXT NOT NULL,
        imap_host TEXT NOT NULL,
        imap_port INTEGER NOT NULL,
        smtp_host TEXT NOT NULL,
        smtp_port INTEGER NOT NULL,
        ignore_tls_errors INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )
    `);
    try {
      migrateDb(instance);
      db = instance;
    } catch (error) {
      instance.close();
      throw error;
    }
  }
  return db;
}

function hasTable(database: Database.Database, table: string): boolean {
  const row = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
    )
    .get(table) as { name: string } | undefined;
  return row !== undefined;
}

function hasColumn(
  database: Database.Database,
  table: string,
  column: string
): boolean {
  if (!hasTable(database, table)) return false;
  const columns = database
    .prepare(`PRAGMA table_info(${table})`)
    .all() as { name: string }[];
  return columns.some((entry) => entry.name === column);
}

function migrateDb(database: Database.Database) {
  if (!hasColumn(database, "accounts", "ignore_tls_errors")) {
    database.exec(
      "ALTER TABLE accounts ADD COLUMN ignore_tls_errors INTEGER NOT NULL DEFAULT 0"
    );
  }
  if (!hasColumn(database, "accounts", "color")) {
    database.exec(
      "ALTER TABLE accounts ADD COLUMN color TEXT NOT NULL DEFAULT '#3b82f6'"
    );
  }
  if (!hasColumn(database, "accounts", "signature")) {
    database.exec(
      "ALTER TABLE accounts ADD COLUMN signature TEXT NOT NULL DEFAULT ''"
    );
  }
  if (!hasColumn(database, "accounts", "from_name")) {
    database.exec(
      "ALTER TABLE accounts ADD COLUMN from_name TEXT NOT NULL DEFAULT ''"
    );
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS labels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS email_labels (
      account_id TEXT NOT NULL,
      folder TEXT NOT NULL,
      uid INTEGER NOT NULL,
      label_id TEXT NOT NULL,
      PRIMARY KEY (account_id, folder, uid, label_id),
      FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS mail_filters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      match_mode TEXT NOT NULL DEFAULT 'all',
      sort_order INTEGER NOT NULL DEFAULT 0,
      baseline_pending INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  if (!hasColumn(database, "mail_filters", "baseline_pending")) {
    database.exec(
      "ALTER TABLE mail_filters ADD COLUMN baseline_pending INTEGER NOT NULL DEFAULT 0"
    );
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS mail_filter_rules (
      id TEXT PRIMARY KEY,
      filter_id TEXT NOT NULL,
      field TEXT NOT NULL,
      operator TEXT NOT NULL,
      value TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (filter_id) REFERENCES mail_filters(id) ON DELETE CASCADE
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS mail_filter_actions (
      id TEXT PRIMARY KEY,
      filter_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (filter_id) REFERENCES mail_filters(id) ON DELETE CASCADE
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS mail_filter_forward_log (
      filter_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      folder TEXT NOT NULL,
      uid INTEGER NOT NULL,
      forwarded_at TEXT NOT NULL,
      PRIMARY KEY (filter_id, account_id, folder, uid)
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS mail_filter_applied_log (
      filter_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      folder TEXT NOT NULL,
      uid INTEGER NOT NULL,
      applied_at TEXT NOT NULL,
      PRIMARY KEY (filter_id, account_id, folder, uid),
      FOREIGN KEY (filter_id) REFERENCES mail_filters(id) ON DELETE CASCADE
    )
  `);

  database.exec(`
    DELETE FROM mail_filter_forward_log
    WHERE filter_id NOT IN (SELECT id FROM mail_filters)
  `);

  database.exec(`
    INSERT OR IGNORE INTO mail_filter_applied_log (filter_id, account_id, folder, uid, applied_at)
    SELECT fl.filter_id, fl.account_id, fl.folder, fl.uid, fl.forwarded_at
    FROM mail_filter_forward_log fl
    INNER JOIN mail_filters mf ON mf.id = fl.filter_id
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS mail_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      html TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  database.exec(`
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
      synced_at TEXT NOT NULL,
      PRIMARY KEY (account_id, folder, uid)
    )
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_cached_messages_list
      ON cached_messages(folder, date DESC)
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_cached_messages_account_folder
      ON cached_messages(account_id, folder, date DESC)
  `);

  database.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS cached_messages_fts USING fts5(
      account_id UNINDEXED,
      folder UNINDEXED,
      uid UNINDEXED,
      subject,
      from_addr,
      to_addr,
      snippet,
      tokenize='unicode61'
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS cached_messages_sync (
      account_id TEXT NOT NULL,
      folder TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      PRIMARY KEY (account_id, folder)
    )
  `);
}

export function getDatabase(): Database.Database {
  return getDb();
}

function rowToAccount(row: Record<string, unknown>): MailAccount {
  return {
    id: row.id as string,
    name: row.name as string,
    fromName: (row.from_name as string) || "",
    email: row.email as string,
    color: (row.color as string) || "#3b82f6",
    signature: (row.signature as string) || "",
    imapHost: row.imap_host as string,
    imapPort: row.imap_port as number,
    smtpHost: row.smtp_host as string,
    smtpPort: row.smtp_port as number,
    ignoreTlsErrors: Boolean(row.ignore_tls_errors),
    createdAt: row.created_at as string,
  };
}

export function listAccounts(): MailAccount[] {
  const rows = getDb()
    .prepare("SELECT * FROM accounts ORDER BY created_at ASC")
    .all() as Record<string, unknown>[];
  return rows.map(rowToAccount);
}

export function getAccount(id: string): MailAccount | null {
  const row = getDb()
    .prepare("SELECT * FROM accounts WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToAccount(row) : null;
}

export function getAccountPassword(id: string): string {
  const row = getDb()
    .prepare("SELECT password_enc FROM accounts WHERE id = ?")
    .get(id) as { password_enc: string } | undefined;
  if (!row) throw new Error("Аккаунт не найден");
  return decrypt(row.password_enc);
}

export function createAccount(input: MailAccountInput): MailAccount {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const existingCount = getDb()
    .prepare("SELECT COUNT(*) as count FROM accounts")
    .get() as { count: number };
  const color = pickAccountColor(existingCount.count);

  getDb()
    .prepare(
      `INSERT INTO accounts (id, name, from_name, email, password_enc, imap_host, imap_port, smtp_host, smtp_port, ignore_tls_errors, color, signature, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.name.trim(),
      "",
      input.email.trim().toLowerCase(),
      encrypt(input.password),
      input.imapHost.trim(),
      input.imapPort,
      input.smtpHost.trim(),
      input.smtpPort,
      input.ignoreTlsErrors ? 1 : 0,
      color,
      "",
      createdAt
    );
  return {
    id,
    name: input.name.trim(),
    fromName: "",
    email: input.email.trim().toLowerCase(),
    color,
    signature: "",
    imapHost: input.imapHost.trim(),
    imapPort: input.imapPort,
    smtpHost: input.smtpHost.trim(),
    smtpPort: input.smtpPort,
    ignoreTlsErrors: Boolean(input.ignoreTlsErrors),
    createdAt,
  };
}

export function updateAccount(
  id: string,
  input: MailAccountUpdate
): MailAccount | null {
  const existing = getAccount(id);
  if (!existing) return null;

  const name = input.name !== undefined ? input.name.trim() : existing.name;
  const fromName =
    input.fromName !== undefined ? input.fromName.trim() : existing.fromName;
  const color = input.color !== undefined ? input.color.trim() : existing.color;
  const signature =
    input.signature !== undefined ? input.signature : existing.signature;

  const imapHost =
    input.imapHost !== undefined ? input.imapHost.trim() : existing.imapHost;
  const imapPort =
    input.imapPort !== undefined ? Number(input.imapPort) : existing.imapPort;
  const smtpHost =
    input.smtpHost !== undefined ? input.smtpHost.trim() : existing.smtpHost;
  const smtpPort =
    input.smtpPort !== undefined ? Number(input.smtpPort) : existing.smtpPort;
  const ignoreTlsErrors =
    input.ignoreTlsErrors !== undefined
      ? Boolean(input.ignoreTlsErrors)
      : existing.ignoreTlsErrors;

  getDb()
    .prepare(
      `UPDATE accounts
       SET name = ?,
           from_name = ?,
           color = ?,
           signature = ?,
           imap_host = ?,
           imap_port = ?,
           smtp_host = ?,
           smtp_port = ?,
           ignore_tls_errors = ?
       WHERE id = ?`
    )
    .run(
      name,
      fromName,
      color,
      signature,
      imapHost,
      imapPort,
      smtpHost,
      smtpPort,
      ignoreTlsErrors ? 1 : 0,
      id
    );

  if (input.password && input.password.trim()) {
    getDb()
      .prepare("UPDATE accounts SET password_enc = ? WHERE id = ?")
      .run(encrypt(input.password.trim()), id);
  }

  return getAccount(id);
}

export function deleteAccount(id: string): boolean {
  const result = getDb().prepare("DELETE FROM accounts WHERE id = ?").run(id);
  return result.changes > 0;
}

export interface AccountWithPassword extends MailAccount {
  password: string;
}

export function getAccountWithPassword(id: string): AccountWithPassword | null {
  const account = getAccount(id);
  if (!account) return null;
  return { ...account, password: getAccountPassword(id) };
}
