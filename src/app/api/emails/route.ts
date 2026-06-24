import { NextResponse } from "next/server";
import { getAccountWithPassword, listAccounts } from "@/lib/db";
import { isValidFolderId } from "@/lib/folders";
import { attachAllLabelsToEmails, attachLabelsToEmails, getLabelsForEmail } from "@/lib/labels-db";
import { fetchEmail, fetchMailbox, searchAllMailboxes } from "@/lib/imap";
import type { EmailSummary } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const uid = searchParams.get("uid");
    const folderParam = searchParams.get("folder") || "inbox";
    const folder = isValidFolderId(folderParam) ? folderParam : "inbox";
    const query = searchParams.get("q")?.trim() || "";

    if (accountId && uid) {
      const account = getAccountWithPassword(accountId);
      if (!account) {
        return NextResponse.json({ error: "Аккаунт не найден" }, { status: 404 });
      }
      const email = await fetchEmail(account, folder, Number(uid));
      if (!email) {
        return NextResponse.json({ error: "Письмо не найдено" }, { status: 404 });
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
        return fetchMailbox(full, folder, 30);
      })
    );

    const emails: EmailSummary[] = [];
    const errors: string[] = [];

    for (const result of batches) {
      if (result.status === "fulfilled") {
        emails.push(...result.value);
      } else {
        errors.push(
          result.reason instanceof Error
            ? result.reason.message
            : "Ошибка загрузки"
        );
      }
    }

    emails.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const emailsWithLabels = query
      ? attachAllLabelsToEmails(emails)
      : attachLabelsToEmails(emails, folder);

    return NextResponse.json({ emails: emailsWithLabels, errors });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}
