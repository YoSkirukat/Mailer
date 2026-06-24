import { getAccountWithPassword } from "./db";
import { isValidFolderId, type MailFolderId } from "./folders";
import {
  countUnreadByUids,
  fetchSummariesByUids,
  searchMailboxUids,
} from "./imap";
import type { EmailRef } from "./labels-db";
import type { EmailSummary } from "./types";

function groupRefsByMailbox(
  refs: EmailRef[]
): Map<string, { accountId: string; folder: MailFolderId; uids: number[] }> {
  const groups = new Map<
    string,
    { accountId: string; folder: MailFolderId; uids: number[] }
  >();

  for (const ref of refs) {
    if (!isValidFolderId(ref.folder)) continue;
    const key = `${ref.accountId}:${ref.folder}`;
    const group = groups.get(key) ?? {
      accountId: ref.accountId,
      folder: ref.folder,
      uids: [],
    };
    group.uids.push(ref.uid);
    groups.set(key, group);
  }

  return groups;
}

export async function fetchEmailsFromRefs(
  refs: EmailRef[]
): Promise<EmailSummary[]> {
  const groups = groupRefsByMailbox(refs);
  const batches = await Promise.allSettled(
    [...groups.values()].map(async (group) => {
      const account = getAccountWithPassword(group.accountId);
      if (!account) return [] as EmailSummary[];
      return fetchSummariesByUids(account, group.folder, group.uids);
    })
  );

  const emails: EmailSummary[] = [];
  for (const result of batches) {
    if (result.status === "fulfilled") {
      emails.push(...result.value);
    }
  }

  return emails.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export async function searchEmailsFromRefs(
  refs: EmailRef[],
  query: string
): Promise<EmailSummary[]> {
  const q = query.trim();
  if (!q) return fetchEmailsFromRefs(refs);
  if (refs.length === 0) return [];

  const groups = groupRefsByMailbox(refs);
  const matchingRefs: EmailRef[] = [];

  const batches = await Promise.allSettled(
    [...groups.values()].map(async (group) => {
      const account = getAccountWithPassword(group.accountId);
      if (!account) return [] as EmailRef[];

      const found = new Set(
        await searchMailboxUids(account, group.folder, q)
      );

      return group.uids
        .filter((uid) => found.has(uid))
        .map((uid) => ({
          accountId: group.accountId,
          folder: group.folder,
          uid,
        }));
    })
  );

  for (const result of batches) {
    if (result.status === "fulfilled") {
      matchingRefs.push(...result.value);
    }
  }

  return fetchEmailsFromRefs(matchingRefs);
}

export async function countUnreadFromRefs(refs: EmailRef[]): Promise<number> {
  const groups = groupRefsByMailbox(refs);
  const batches = await Promise.allSettled(
    [...groups.values()].map(async (group) => {
      const account = getAccountWithPassword(group.accountId);
      if (!account) return 0;
      return countUnreadByUids(account, group.folder, group.uids);
    })
  );

  let total = 0;
  for (const result of batches) {
    if (result.status === "fulfilled") {
      total += result.value;
    }
  }
  return total;
}

export async function countUnreadPerLabel(
  grouped: Record<string, EmailRef[]>
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const entries = await Promise.allSettled(
    Object.entries(grouped).map(async ([labelId, refs]) => {
      const count = await countUnreadFromRefs(refs);
      return { labelId, count };
    })
  );

  for (const result of entries) {
    if (result.status === "fulfilled") {
      counts[result.value.labelId] = result.value.count;
    }
  }

  return counts;
}
