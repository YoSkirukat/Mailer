import type { ImapFlow } from "imapflow";

export type MailFolderId =
  | "inbox"
  | "sent"
  | "trash"
  | "spam"
  | "archive";

export interface MailFolder {
  id: MailFolderId;
  label: string;
  candidates: string[];
}

export const MAIL_FOLDERS: MailFolder[] = [
  {
    id: "inbox",
    label: "Входящие",
    candidates: ["INBOX"],
  },
  {
    id: "sent",
    label: "Отправленные",
    candidates: [
      "Отправленные",
      "Sent",
      "Sent Items",
      "Sent Messages",
      "Sent Mail",
      "[Gmail]/Sent Mail",
    ],
  },
  {
    id: "archive",
    label: "Архив",
    candidates: [
      "Archive",
      "Archives",
      "Archived",
      "Архив",
      "All Mail",
      "[Gmail]/All Mail",
    ],
  },
  {
    id: "spam",
    label: "Спам",
    candidates: [
      "Spam",
      "Junk",
      "Junk E-mail",
      "Junk Email",
      "Bulk Mail",
      "Спам",
      "[Gmail]/Spam",
    ],
  },
  {
    id: "trash",
    label: "Корзина",
    candidates: [
      "Trash",
      "Deleted",
      "Deleted Items",
      "Deleted Messages",
      "Bin",
      "Корзина",
      "Удалённые",
      "[Gmail]/Trash",
    ],
  },
];

/** Папки, по которым выполняется глобальный поиск (без спама) */
export const SEARCHABLE_FOLDERS: MailFolderId[] = [
  "inbox",
  "sent",
  "archive",
  "trash",
];

export const EMPTY_UNREAD_COUNTS: Record<MailFolderId, number> = {
  inbox: 0,
  sent: 0,
  archive: 0,
  spam: 0,
  trash: 0,
};

export function getFolderLabel(id: MailFolderId): string {
  return MAIL_FOLDERS.find((f) => f.id === id)?.label ?? id;
}

function normalizePath(path: string): string {
  return path.toLowerCase().replace(/\\/g, "/");
}

export async function resolveMailbox(
  client: ImapFlow,
  folderId: MailFolderId
): Promise<string | null> {
  if (folderId === "inbox") return "INBOX";

  const config = MAIL_FOLDERS.find((f) => f.id === folderId);
  if (!config) return null;

  const mailboxes = await client.list();
  const paths = mailboxes.map((m) => m.path);

  for (const candidate of config.candidates) {
    const norm = normalizePath(candidate);
    const exact = paths.find((p) => normalizePath(p) === norm);
    if (exact) return exact;

    const suffix = paths.find(
      (p) =>
        normalizePath(p).endsWith(`/${norm}`) ||
        normalizePath(p).endsWith(norm)
    );
    if (suffix) return suffix;
  }

  return null;
}

export function isValidFolderId(value: string): value is MailFolderId {
  return MAIL_FOLDERS.some((f) => f.id === value);
}
