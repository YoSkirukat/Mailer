import { NextResponse } from "next/server";
import { getAccountWithPassword } from "@/lib/db";
import { isValidFolderId } from "@/lib/folders";
import { clearFilterLogsForEmail } from "@/lib/filters-db";
import { clearEmailLabels } from "@/lib/labels-db";
import {
  deleteCachedMessage,
  updateCachedMessageSeen,
} from "@/lib/mail-cache-db";
import {
  deleteCachedMessageDetail,
  updateCachedMessageDetailSeen,
} from "@/lib/mail-detail-cache-db";
import { deleteEmail, moveEmail, setEmailSeen } from "@/lib/imap";

type EmailAction =
  | "markRead"
  | "markUnread"
  | "delete"
  | "archive"
  | "spam"
  | "notSpam";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { accountId, uid, action, folder: folderParam } = body as {
      accountId?: string;
      uid?: number;
      action?: EmailAction;
      folder?: string;
    };

    const folder =
      folderParam && isValidFolderId(folderParam) ? folderParam : "inbox";

    if (!accountId || !uid || !action) {
      return NextResponse.json(
        { error: "Укажите accountId, uid и action" },
        { status: 400 }
      );
    }

    const account = getAccountWithPassword(accountId);
    if (!account) {
      return NextResponse.json({ error: "Аккаунт не найден" }, { status: 404 });
    }

    const ref = { accountId, folder, uid };

    const clearLocalEmailState = () => {
      clearEmailLabels(ref);
      clearFilterLogsForEmail(accountId, folder, uid);
    };

    switch (action) {
      case "markRead":
        await setEmailSeen(account, folder, uid, true);
        updateCachedMessageSeen(accountId, folder, uid, true);
        updateCachedMessageDetailSeen(accountId, folder, uid, true);
        break;
      case "markUnread":
        await setEmailSeen(account, folder, uid, false);
        updateCachedMessageSeen(accountId, folder, uid, false);
        updateCachedMessageDetailSeen(accountId, folder, uid, false);
        break;
      case "delete":
        await deleteEmail(account, folder, uid);
        deleteCachedMessage(accountId, folder, uid);
        deleteCachedMessageDetail(accountId, folder, uid);
        clearLocalEmailState();
        break;
      case "archive":
        await moveEmail(account, folder, "archive", uid);
        deleteCachedMessage(accountId, folder, uid);
        deleteCachedMessageDetail(accountId, folder, uid);
        clearLocalEmailState();
        break;
      case "spam":
        await moveEmail(account, folder, "spam", uid);
        deleteCachedMessage(accountId, folder, uid);
        deleteCachedMessageDetail(accountId, folder, uid);
        clearLocalEmailState();
        break;
      case "notSpam":
        await moveEmail(account, "spam", "inbox", uid);
        deleteCachedMessage(accountId, "spam", uid);
        deleteCachedMessageDetail(accountId, "spam", uid);
        clearLocalEmailState();
        break;
      default:
        return NextResponse.json(
          { error: "Неизвестное действие" },
          { status: 400 }
        );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}
