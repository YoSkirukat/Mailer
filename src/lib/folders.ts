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

const mailboxPathCache = new Map<string, string>();

function mailboxCacheKey(accountKey: string, folderId: MailFolderId): string {
  return `${accountKey.toLowerCase()}:${folderId}`;
}

async function populateMailboxPathCache(
  client: ImapFlow,
  accountKey: string
): Promise<void> {
  mailboxPathCache.set(mailboxCacheKey(accountKey, "inbox"), "INBOX");

  const mailboxes = await client.list();
  const paths = mailboxes.map((mailbox) => mailbox.path);

  for (const folder of MAIL_FOLDERS) {
    if (folder.id === "inbox") continue;

    for (const candidate of folder.candidates) {
      const norm = normalizePath(candidate);
      const exact = paths.find((path) => normalizePath(path) === norm);
      if (exact) {
        mailboxPathCache.set(mailboxCacheKey(accountKey, folder.id), exact);
        break;
      }

      const suffix = paths.find(
        (path) =>
          normalizePath(path).endsWith(`/${norm}`) ||
          normalizePath(path).endsWith(norm)
      );
      if (suffix) {
        mailboxPathCache.set(mailboxCacheKey(accountKey, folder.id), suffix);
        break;
      }
    }
  }
}

export async function resolveMailbox(
  client: ImapFlow,
  folderId: MailFolderId,
  accountKey?: string
): Promise<string | null> {
  if (folderId === "inbox") return "INBOX";

  if (accountKey) {
    const cached = mailboxPathCache.get(mailboxCacheKey(accountKey, folderId));
    if (cached) return cached;

    await populateMailboxPathCache(client, accountKey);
    return mailboxPathCache.get(mailboxCacheKey(accountKey, folderId)) ?? null;
  }

  const config = MAIL_FOLDERS.find((folder) => folder.id === folderId);
  if (!config) return null;

  const mailboxes = await client.list();
  const paths = mailboxes.map((mailbox) => mailbox.path);

  for (const candidate of config.candidates) {
    const norm = normalizePath(candidate);
    const exact = paths.find((path) => normalizePath(path) === norm);
    if (exact) return exact;

    const suffix = paths.find(
      (path) =>
        normalizePath(path).endsWith(`/${norm}`) ||
        normalizePath(path).endsWith(norm)
    );
    if (suffix) return suffix;
  }

  return null;
}

export function isValidFolderId(value: string): value is MailFolderId {
  return MAIL_FOLDERS.some((f) => f.id === value);
}
