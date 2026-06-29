import { randomUUID } from "crypto";
import { getDatabase } from "./db";
import type { MailTemplate, MailTemplateInput } from "./types";

function rowToTemplate(row: Record<string, unknown>): MailTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    subject: (row.subject as string) || "",
    html: (row.html as string) || "",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function listMailTemplates(): MailTemplate[] {
  const rows = getDatabase()
    .prepare("SELECT * FROM mail_templates ORDER BY created_at ASC")
    .all() as Record<string, unknown>[];
  return rows.map(rowToTemplate);
}

export function getMailTemplate(id: string): MailTemplate | null {
  const row = getDatabase()
    .prepare("SELECT * FROM mail_templates WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToTemplate(row) : null;
}

export function createMailTemplate(input: MailTemplateInput): MailTemplate {
  const name = input.name.trim();
  if (!name) throw new Error("Укажите название шаблона");
  if (!input.html.trim()) throw new Error("Заполните текст шаблона");

  const id = randomUUID();
  const now = new Date().toISOString();
  const subject = input.subject?.trim() ?? "";

  getDatabase()
    .prepare(
      "INSERT INTO mail_templates (id, name, subject, html, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(id, name, subject, input.html, now, now);

  return getMailTemplate(id)!;
}

export function updateMailTemplate(
  id: string,
  input: MailTemplateInput
): MailTemplate | null {
  const existing = getMailTemplate(id);
  if (!existing) return null;

  const name = input.name.trim();
  if (!name) throw new Error("Укажите название шаблона");
  if (!input.html.trim()) throw new Error("Заполните текст шаблона");

  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      "UPDATE mail_templates SET name = ?, subject = ?, html = ?, updated_at = ? WHERE id = ?"
    )
    .run(name, input.subject?.trim() ?? "", input.html, now, id);

  return getMailTemplate(id);
}

export function deleteMailTemplate(id: string): boolean {
  const result = getDatabase()
    .prepare("DELETE FROM mail_templates WHERE id = ?")
    .run(id);
  return result.changes > 0;
}
