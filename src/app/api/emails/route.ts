import { NextResponse } from "next/server";
import { getAccountWithPassword, listAccounts, type AccountWithPassword } from "@/lib/db";
import {
  resolveCachedEmailDetail,
  storeCachedEmailDetail,
} from "@/lib/email-detail-cache";
import { isValidFolderId, type MailFolderId } from "@/lib/folders";
import { attachAllLabelsToEmails, attachLabelsToEmails, getLabelsForEmail } from "@/lib/labels-db";
import { applyMailFilters, applyMailFiltersForUid } from "@/lib/filter-engine";
import { listEnabledMailFilters } from "@/lib/filters-db";
import {
  listCachedMessages,
  updateCachedMessageSeen,
} from "@/lib/mail-cache-db";
import { updateCachedMessageDetailSeen } from "@/lib/mail-detail-cache-db";
import {
  searchMailboxesWithCache,
  syncFolderCache,
  isCacheFresh,
  LIST_PAGE_SIZE,
} from "@/lib/mail-sync";
import { fetchEmail, formatImapErrorMessage, setEmailSeen } from "@/lib/imap";
import type { EmailSummary } from "@/lib/types";

async function fetchListForAccount(
  full: AccountWithPassword,
  folder: MailFolderId,
  unreadOnly: boolean,
  offset: number,
  limit: number
): Promise<{ emails: EmailSummary[]; errors: string[]; hasMore: boolean }> {
  const applyInboxFilters = async (
    emails: EmailSummary[]
  ): Promise<{ emails: EmailSummary[]; errors: string[] }> => {
    if (folder === "inbox" && !unreadOnly) {
      const filters = listEnabledMailFilters();
      if (filters.length > 0) {
        return applyMailFilters(full, folder, emails, filters);
      }
    }
    return { emails, errors: [] };
  };

  if (offset === 0 && !unreadOnly) {
    const cached = listCachedMessages([full.id], folder, {
      limit,
      unreadOnly,
      offset: 0,
    });
    const fresh = isCacheFresh(full.id, folder);

    if (cached.length > 0) {
      if (!fresh) {
        void syncFolderCache(full, folder, unreadOnly, limit, 0).catch((err) =>
          console.error(`[mail-sync] ${full.email}:`, err)
        );
      }
      const filtered = await applyInboxFilters(cached);
      return {
        ...filtered,
        hasMore: cached.length >= limit,
      };
    }
  }

  const page = await syncFolderCache(full, folder, unreadOnly, limit, offset);
  const filtered = await applyInboxFilters(page.emails);
  return {
    ...filtered,
    hasMore: page.hasMore,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const uid = searchParams.get("uid");
    const folderParam = searchParams.get("folder") || "inbox";
    const folder = isValidFolderId(folderParam) ? folderParam : "inbox";
    const query = searchParams.get("q")?.trim() || "";
    const unreadOnly = searchParams.get("unreadOnly") === "1";
    const offset = Math.max(0, Number(searchParams.get("offset") || "0") || 0);
    const limit = Math.min(
      100,
      Math.max(1, Number(searchParams.get("limit") || String(LIST_PAGE_SIZE)) || LIST_PAGE_SIZE)
    );

    if (accountId && uid) {
      const account = getAccountWithPassword(accountId);
      if (!account) {
        return NextResponse.json({ error: "Аккаунт не найден" }, { status: 404 });
      }

      const numericUid = Number(uid);
      let email = resolveCachedEmailDetail(accountId, folder, numericUid);

      if (email) {
        const labels = getLabelsForEmail({
          accountId,
          folder,
          uid: numericUid,
        });

        if (!email.seen) {
          email = { ...email, seen: true };
          storeCachedEmailDetail(email, folder);
          updateCachedMessageSeen(accountId, folder, numericUid, true);
          void setEmailSeen(account, folder, numericUid, true).catch((err) =>
            console.error(`[emails] mark read ${account.email}:`, err)
          );
        }

        const filters = listEnabledMailFilters();
        if (folder === "inbox" && filters.length > 0) {
          void applyMailFiltersForUid(account, folder, numericUid, filters).catch(
            (err) => console.error(`[filter] open ${account.email}:`, err)
          );
        }

        return NextResponse.json({
          ...email,
          labels,
          filterErrors: [],
        });
      }

      email = await fetchEmail(account, folder, numericUid);
      if (!email) {
        return NextResponse.json({ error: "Письмо не найдено" }, { status: 404 });
      }

      storeCachedEmailDetail(email, folder);
      updateCachedMessageSeen(accountId, folder, numericUid, true);
      updateCachedMessageDetailSeen(accountId, folder, numericUid, true);

      const filters = listEnabledMailFilters();
      let filterErrors: string[] = [];
      if (folder === "inbox" && filters.length > 0) {
        void applyMailFiltersForUid(account, folder, numericUid, filters)
          .then((filterResult) => {
            if (filterResult.errors.length > 0) {
              console.error(`[filter] open ${account.email}:`, filterResult.errors);
            }
          })
          .catch((err) => console.error(`[filter] open ${account.email}:`, err));
      }

      const labels = getLabelsForEmail({
        accountId,
        folder,
        uid: numericUid,
      });
      return NextResponse.json({
        ...email,
        labels,
        filterErrors,
      });
    }

    const accounts = accountId
      ? listAccounts().filter((a) => a.id === accountId)
      : listAccounts();

    if (accounts.length === 0) {
      return NextResponse.json([]);
    }

    const batches = await Promise.allSettled(
      accounts.map(async (acc) => {
        const full = getAccountWithPassword(acc.id);
        if (!full) {
          return {
            emails: [] as EmailSummary[],
            errors: [] as string[],
            hasMore: false,
          };
        }

        if (query) {
          return {
            emails: await searchMailboxesWithCache(full, query),
            errors: [] as string[],
            hasMore: false,
          };
        }

        return fetchListForAccount(full, folder, unreadOnly, offset, limit);
      })
    );

    const emails: EmailSummary[] = [];
    const errors: string[] = [];
    let hasMore = false;

    batches.forEach((result, index) => {
      if (result.status === "fulfilled") {
        emails.push(...result.value.emails);
        if (result.value.errors.length > 0) {
          errors.push(...result.value.errors);
        }
        if (result.value.hasMore) {
          hasMore = true;
        }
        return;
      }

      const account = accounts[index];
      const detail = formatImapErrorMessage(result.reason);
      const message = account
        ? `${account.email}: ${detail}`
        : detail;

      console.error(
        `[emails] ${account?.email ?? "unknown"}:`,
        result.reason
      );
      errors.push(message);
    });

    emails.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const emailsWithLabels = (
      query ? attachAllLabelsToEmails(emails) : attachLabelsToEmails(emails, folder)
    ).map((email) =>
      unreadOnly ? { ...email, seen: false } : email
    );

    return NextResponse.json({ emails: emailsWithLabels, errors, hasMore });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}
