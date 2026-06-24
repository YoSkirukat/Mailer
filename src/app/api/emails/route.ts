import { NextResponse } from "next/server";
import { getAccountWithPassword, listAccounts } from "@/lib/db";
import {
  emailDetailCacheKey,
  getCachedEmailDetail,
  setCachedEmailDetail,
} from "@/lib/email-detail-cache";
import { isValidFolderId } from "@/lib/folders";
import { attachAllLabelsToEmails, attachLabelsToEmails, getLabelsForEmail } from "@/lib/labels-db";
import { fetchEmail, fetchMailbox, fetchUnreadMailbox, searchAllMailboxes, setEmailSeen } from "@/lib/imap";
import type { EmailSummary } from "@/lib/types";
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const uid = searchParams.get("uid");
    const folderParam = searchParams.get("folder") || "inbox";
    const folder = isValidFolderId(folderParam) ? folderParam : "inbox";
    const query = searchParams.get("q")?.trim() || "";
    const unreadOnly = searchParams.get("unreadOnly") === "1";

    if (accountId && uid) {
      const account = getAccountWithPassword(accountId);
      if (!account) {
        return NextResponse.json({ error: "Аккаунт не найден" }, { status: 404 });
      }

      const cacheKey = emailDetailCacheKey(accountId, folder, Number(uid));
      let email = getCachedEmailDetail(cacheKey);

      if (email) {
        if (!email.seen) {
          await setEmailSeen(account, folder, Number(uid), true);
          email = { ...email, seen: true };
          setCachedEmailDetail(cacheKey, email);
        }
      } else {
        email = await fetchEmail(account, folder, Number(uid));
        if (!email) {
          return NextResponse.json({ error: "Письмо не найдено" }, { status: 404 });
        }
        setCachedEmailDetail(cacheKey, email);
      }

      const labels = getLabelsForEmail({
        accountId,
        folder,
        uid: Number(uid),
      });
      return NextResponse.json({ ...email, labels });
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
        if (!full) return [] as EmailSummary[];
        if (query) {
          return searchAllMailboxes(full, query);
        }
        if (unreadOnly) {
          return fetchUnreadMailbox(full, folder, 50);
        }
        return fetchMailbox(full, folder, 30);
      })
    );

    const emails: EmailSummary[] = [];
    const errors: string[] = [];

    batches.forEach((result, index) => {
      if (result.status === "fulfilled") {
        emails.push(...result.value);
        return;
      }

      const account = accounts[index];
      const raw =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason ?? "");
      const detail = raw.trim() || "Ошибка загрузки";
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

    return NextResponse.json({ emails: emailsWithLabels, errors });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}
