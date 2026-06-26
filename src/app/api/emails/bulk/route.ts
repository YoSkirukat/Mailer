import { NextResponse } from "next/server";
import { getAccountWithPassword } from "@/lib/db";
import { isValidFolderId, type MailFolderId } from "@/lib/folders";
import { clearEmailLabels } from "@/lib/labels-db";
import { deleteEmail, moveEmail } from "@/lib/imap";

type BulkAction = "delete" | "archive" | "spam" | "notSpam";

interface BulkItem {
  accountId: string;
  uid: number;
  folder: MailFolderId;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, items } = body as {
      action?: BulkAction;
      items?: BulkItem[];
    };

    if (!action || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Укажите action и список писем" },
        { status: 400 }
      );
    }

    const errors: string[] = [];

    await Promise.allSettled(
      items.map(async (item) => {
        if (!item.accountId || !item.uid) return;
        const folder = isValidFolderId(item.folder) ? item.folder : "inbox";
        const account = getAccountWithPassword(item.accountId);
        if (!account) {
          errors.push(`Аккаунт не найден: ${item.accountId}`);
          return;
        }

        const ref = { accountId: item.accountId, folder, uid: item.uid };

        switch (action) {
          case "delete":
            await deleteEmail(account, folder, item.uid);
            clearEmailLabels(ref);
            break;
          case "archive":
            await moveEmail(account, folder, "archive", item.uid);
            clearEmailLabels(ref);
            break;
          case "spam":
            await moveEmail(account, folder, "spam", item.uid);
            clearEmailLabels(ref);
            break;
          case "notSpam":
            await moveEmail(account, "spam", "inbox", item.uid);
            clearEmailLabels(ref);
            break;
          default:
            throw new Error("Неизвестное действие");
        }
      })
    ).then((results) => {
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          const item = items[index];
          const message =
            result.reason instanceof Error
              ? result.reason.message
              : "Ошибка действия";
          errors.push(`${item.accountId}:${item.uid} — ${message}`);
        }
      });
    });

    if (errors.length === items.length) {
      return NextResponse.json(
        { error: errors[0] || "Не удалось выполнить действие" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}
