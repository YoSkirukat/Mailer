import { randomUUID } from "crypto";
import { getDatabase } from "./db";

export interface MailContact {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

function rowToContact(row: Record<string, unknown>): MailContact {
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    createdAt: row.created_at as string,
  };
}

export function ensureContactsTable(): void {
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL
    )
  `);
}

export function listContacts(): MailContact[] {
  ensureContactsTable();
  const rows = getDatabase()
    .prepare("SELECT * FROM contacts ORDER BY name COLLATE NOCASE ASC")
    .all() as Record<string, unknown>[];
  return rows.map(rowToContact);
}

export function getContactByEmail(email: string): MailContact | null {
  ensureContactsTable();
  const row = getDatabase()
    .prepare("SELECT * FROM contacts WHERE email = ? COLLATE NOCASE")
    .get(email.trim().toLowerCase()) as Record<string, unknown> | undefined;
  return row ? rowToContact(row) : null;
}

export function createContact(input: {
  name: string;
  email: string;
}): { contact: MailContact; created: boolean } {
  ensureContactsTable();
  const email = input.email.trim().toLowerCase();
  const existing = getContactByEmail(email);
  if (existing) return { contact: existing, created: false };

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const name = input.name.trim() || email;

  getDatabase()
    .prepare(
      "INSERT INTO contacts (id, name, email, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(id, name, email, createdAt);

  return {
    contact: { id, name, email, createdAt },
    created: true,
  };
}
