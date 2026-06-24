import { randomUUID } from "crypto";
import { getDatabase } from "./db";
import type { MailLabel, MailLabelInput } from "./types";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function normalizeColor(color: string): string {
  const c = color.trim();
  if (!HEX_COLOR.test(c)) {
    throw new Error("Некорректный цвет. Используйте формат #RRGGBB");
  }
  return c.toLowerCase();
}

function rowToLabel(row: Record<string, unknown>): MailLabel {
  return {
    id: row.id as string,
    name: row.name as string,
    color: row.color as string,
    createdAt: row.created_at as string,
  };
}

export function listLabels(): MailLabel[] {
  const rows = getDatabase()
    .prepare("SELECT * FROM labels ORDER BY created_at ASC")
    .all() as Record<string, unknown>[];
  return rows.map(rowToLabel);
}

export function createLabel(input: MailLabelInput): MailLabel {
  const name = input.name.trim();
  if (!name) throw new Error("Укажите название ярлыка");

  const id = randomUUID();
  const color = normalizeColor(input.color);
  const createdAt = new Date().toISOString();

  getDatabase()
    .prepare(
      "INSERT INTO labels (id, name, color, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(id, name, color, createdAt);

  return { id, name, color, createdAt };
}

export function updateLabel(
  id: string,
  input: Partial<MailLabelInput>
): MailLabel | null {
  const existing = getDatabase()
    .prepare("SELECT * FROM labels WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  if (!existing) return null;

  const name = input.name !== undefined ? input.name.trim() : (existing.name as string);
  if (!name) throw new Error("Укажите название ярлыка");

  const color =
    input.color !== undefined
      ? normalizeColor(input.color)
      : (existing.color as string);

  getDatabase()
    .prepare("UPDATE labels SET name = ?, color = ? WHERE id = ?")
    .run(name, color, id);

  return {
    id,
    name,
    color,
    createdAt: existing.created_at as string,
  };
}

export function deleteLabel(id: string): boolean {
  const result = getDatabase().prepare("DELETE FROM labels WHERE id = ?").run(id);
  return result.changes > 0;
}

export interface EmailRef {
  accountId: string;
  folder: string;
  uid: number;
}

export function assignLabel(
  ref: EmailRef,
  labelId: string
): void {
  const label = getDatabase()
    .prepare("SELECT id FROM labels WHERE id = ?")
    .get(labelId);
  if (!label) throw new Error("Ярлык не найден");

  getDatabase()
    .prepare(
      `INSERT OR IGNORE INTO email_labels (account_id, folder, uid, label_id)
       VALUES (?, ?, ?, ?)`
    )
    .run(ref.accountId, ref.folder, ref.uid, labelId);
}

export function unassignLabel(ref: EmailRef, labelId: string): void {
  getDatabase()
    .prepare(
      `DELETE FROM email_labels
       WHERE account_id = ? AND folder = ? AND uid = ? AND label_id = ?`
    )
    .run(ref.accountId, ref.folder, ref.uid, labelId);
}

export function clearEmailLabels(ref: EmailRef): void {
  getDatabase()
    .prepare(
      `DELETE FROM email_labels
       WHERE account_id = ? AND folder = ? AND uid = ?`
    )
    .run(ref.accountId, ref.folder, ref.uid);
}

export function getLabelsForEmail(ref: EmailRef): MailLabel[] {
  const rows = getDatabase()
    .prepare(
      `SELECT l.* FROM labels l
       INNER JOIN email_labels el ON el.label_id = l.id
       WHERE el.account_id = ? AND el.folder = ? AND el.uid = ?
       ORDER BY l.created_at ASC`
    )
    .all(ref.accountId, ref.folder, ref.uid) as Record<string, unknown>[];
  return rows.map(rowToLabel);
}

export function attachLabelsToEmails<
  T extends { accountId: string; folder?: string; uid: number },
>(emails: T[], folder: string): (T & { labels: MailLabel[] })[] {
  if (emails.length === 0) return [];
  return attachAllLabelsToEmails(emails);
}

export function attachAllLabelsToEmails<
  T extends { accountId: string; folder?: string; uid: number },
>(emails: T[]): (T & { labels: MailLabel[] })[] {
  if (emails.length === 0) return [];

  const allLabels = listLabels();
  const labelMap = new Map(allLabels.map((l) => [l.id, l]));

  const rows = getDatabase()
    .prepare(
      `SELECT account_id, folder, uid, label_id FROM email_labels`
    )
    .all() as {
    account_id: string;
    folder: string;
    uid: number;
    label_id: string;
  }[];

  const assignmentMap = new Map<string, MailLabel[]>();
  for (const row of rows) {
    const label = labelMap.get(row.label_id);
    if (!label) continue;
    const key = `${row.account_id}:${row.folder}:${row.uid}`;
    const list = assignmentMap.get(key) ?? [];
    list.push(label);
    assignmentMap.set(key, list);
  }

  return emails.map((email) => {
    const f = email.folder ?? "inbox";
    const key = `${email.accountId}:${f}:${email.uid}`;
    return { ...email, labels: assignmentMap.get(key) ?? [] };
  });
}

export function getEmailRefsForLabel(
  labelId: string,
  accountId?: string | null
): EmailRef[] {
  const rows = (
    accountId
      ? getDatabase()
          .prepare(
            `SELECT account_id, folder, uid FROM email_labels
             WHERE label_id = ? AND account_id = ?`
          )
          .all(labelId, accountId)
      : getDatabase()
          .prepare(
            `SELECT account_id, folder, uid FROM email_labels WHERE label_id = ?`
          )
          .all(labelId)
  ) as { account_id: string; folder: string; uid: number }[];

  return rows.map((row) => ({
    accountId: row.account_id,
    folder: row.folder,
    uid: row.uid,
  }));
}

export function getEmailRefsGroupedByLabel(
  accountId?: string | null
): Record<string, EmailRef[]> {
  const rows = (
    accountId
      ? getDatabase()
          .prepare(
            `SELECT label_id, account_id, folder, uid FROM email_labels
             WHERE account_id = ?`
          )
          .all(accountId)
      : getDatabase()
          .prepare(
            `SELECT label_id, account_id, folder, uid FROM email_labels`
          )
          .all()
  ) as {
    label_id: string;
    account_id: string;
    folder: string;
    uid: number;
  }[];

  const grouped: Record<string, EmailRef[]> = {};
  for (const row of rows) {
    if (!grouped[row.label_id]) grouped[row.label_id] = [];
    grouped[row.label_id].push({
      accountId: row.account_id,
      folder: row.folder,
      uid: row.uid,
    });
  }
  return grouped;
}
