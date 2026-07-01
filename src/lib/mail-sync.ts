import {
  getCacheSyncTime,
  mergeCachedMessages,
  mergeCachedSearchResults,
  replaceCachedMessages,
} from "@/lib/mail-cache-db";
import type { AccountWithPassword } from "@/lib/db";
import type { MailFolderId } from "@/lib/folders";
import {
  fetchMailbox,
  fetchUnreadMailbox,
  searchAllMailboxes,
} from "@/lib/imap";
import type { EmailSummary } from "@/lib/types";

export const CACHE_FRESH_MS = 45_000;
export const LIST_PAGE_SIZE = 50;

export const SEARCH_SYNC_FOLDERS: MailFolderId[] = [
  "inbox",
  "sent",
  "archive",
  "spam",
];

export function isCacheFresh(
  accountId: string,
  folder: MailFolderId,
  maxAgeMs = CACHE_FRESH_MS
): boolean {
  const syncedAt = getCacheSyncTime(accountId, folder);
  if (!syncedAt) return false;
  return Date.now() - new Date(syncedAt).getTime() < maxAgeMs;
}

export async function syncFolderCache(
  account: AccountWithPassword,
  folder: MailFolderId,
  unreadOnly = false,
  limit = LIST_PAGE_SIZE,
  offset = 0
): Promise<{ emails: EmailSummary[]; hasMore: boolean }> {
  if (unreadOnly) {
    const emails = await fetchUnreadMailbox(account, folder, limit);
    if (offset === 0) {
      replaceCachedMessages(account.id, folder, emails);
    } else {
      mergeCachedMessages(account.id, folder, emails);
    }
    return { emails, hasMore: false };
  }

  const page = await fetchMailbox(account, folder, limit, offset);
  if (offset === 0) {
    replaceCachedMessages(account.id, folder, page.emails);
  } else {
    mergeCachedMessages(account.id, folder, page.emails);
  }
  return page;
}

export async function refreshSearchableCacheIfStale(
  account: AccountWithPassword
): Promise<void> {
  for (const folder of SEARCH_SYNC_FOLDERS) {
    if (!isCacheFresh(account.id, folder)) {
      await syncFolderCache(account, folder, false, LIST_PAGE_SIZE, 0);
    }
  }
}

export async function searchMailboxesWithCache(
  account: AccountWithPassword,
  query: string
): Promise<EmailSummary[]> {
  const emails = await searchAllMailboxes(account, query);
  mergeCachedSearchResults(emails);
  return emails;
}
