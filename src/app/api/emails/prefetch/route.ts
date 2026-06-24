import { NextResponse } from "next/server";
import { getAccountWithPassword } from "@/lib/db";
import {
  emailDetailCacheKey,
  getCachedEmailDetail,
  setCachedEmailDetail,
} from "@/lib/email-detail-cache";
import { isValidFolderId, type MailFolderId } from "@/lib/folders";
import { attachLabelsToEmails } from "@/lib/labels-db";
import { fetchEmailsBatch } from "@/lib/imap";
import type { EmailDetail } from "@/lib/types";

interface PrefetchItem {
  accountId: string;
  folder: MailFolderId;
  uid: number;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { items?: PrefetchItem[] };
    const items = body.items ?? [];
    if (items.length === 0) {
      return NextResponse.json({ emails: [] });
    }

    const grouped = new Map<string, PrefetchItem[]>();
    for (const item of items) {
      if (!item.accountId || !item.uid) continue;
      const folder = isValidFolderId(item.folder) ? item.folder : "inbox";
      const key = `${item.accountId}:${folder}`;
      const list = grouped.get(key) ?? [];
      list.push({ ...item, folder });
      grouped.set(key, list);
    }

    const emails: EmailDetail[] = [];

    for (const [groupKey, groupItems] of grouped) {
      const [accountId, folder] = groupKey.split(":") as [string, MailFolderId];
      const account = getAccountWithPassword(accountId);
      if (!account) continue;

      const uids = [
        ...new Set(
          groupItems
            .map((item) => item.uid)
            .filter((uid) => !getCachedEmailDetail(emailDetailCacheKey(accountId, folder, uid)))
        ),
      ];

      if (uids.length === 0) continue;

      const batch = await fetchEmailsBatch(account, folder, uids.slice(0, 15));
      const withLabels = attachLabelsToEmails(batch, folder);

      for (const detail of withLabels) {
        setCachedEmailDetail(
          emailDetailCacheKey(detail.accountId, folder, detail.uid),
          detail
        );
        emails.push(detail);
      }
    }

    return NextResponse.json({ emails });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}
