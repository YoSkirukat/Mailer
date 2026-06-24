import { NextResponse } from "next/server";
import { getAccountWithPassword, listAccounts } from "@/lib/db";
import {
  EMPTY_UNREAD_COUNTS,
  MAIL_FOLDERS,
  type MailFolderId,
} from "@/lib/folders";
import { getFolderUnreadCount } from "@/lib/imap";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    const accounts = accountId
      ? listAccounts().filter((a) => a.id === accountId)
      : listAccounts();

    const counts: Record<MailFolderId, number> = { ...EMPTY_UNREAD_COUNTS };

    if (accounts.length === 0) {
      return NextResponse.json(counts);
    }

    const tasks = accounts.flatMap((acc) => {
      const full = getAccountWithPassword(acc.id);
      if (!full) return [];
      return MAIL_FOLDERS.map(async (folder) => {
        const count = await getFolderUnreadCount(full, folder.id);
        return { folderId: folder.id, count };
      });
    });

    const results = await Promise.allSettled(tasks);
    for (const result of results) {
      if (result.status === "fulfilled") {
        counts[result.value.folderId] += result.value.count;
      }
    }

    return NextResponse.json(counts);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}
