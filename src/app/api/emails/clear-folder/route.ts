import { NextResponse } from "next/server";
import { getAccountWithPassword, listAccounts } from "@/lib/db";
import { isValidFolderId, type MailFolderId } from "@/lib/folders";
import { clearMailbox } from "@/lib/imap";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { folder: folderParam, accountId } = body as {
      folder?: string;
      accountId?: string | null;
    };

    if (!folderParam || !isValidFolderId(folderParam)) {
      return NextResponse.json({ error: "Укажите папку" }, { status: 400 });
    }

    const folder = folderParam as MailFolderId;
    const accounts = accountId
      ? listAccounts().filter((a) => a.id === accountId)
      : listAccounts();

    if (accounts.length === 0) {
      return NextResponse.json({ deleted: 0 });
    }

    let deleted = 0;
    const errors: string[] = [];

    const results = await Promise.allSettled(
      accounts.map(async (acc) => {
        const full = getAccountWithPassword(acc.id);
        if (!full) return 0;
        return clearMailbox(full, folder);
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        deleted += result.value;
      } else {
        const message =
          result.reason instanceof Error
            ? result.reason.message
            : "Ошибка удаления";
        errors.push(message);
      }
    }

    if (deleted === 0 && errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      deleted,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}
