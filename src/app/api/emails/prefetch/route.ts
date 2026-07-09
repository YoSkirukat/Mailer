import { NextResponse } from "next/server";
import { getAccountWithPassword } from "@/lib/db";
import {
  resolveCachedEmailDetail,
  storeCachedEmailDetail,
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

      const uniqUids = [...new Set(groupItems.map((item) => item.uid))];

      const cachedDetails: EmailDetail[] = [];
      const missingUids: number[] = [];

      for (const uid of uniqUids) {
        const cached = resolveCachedEmailDetail(accountId, folder, uid);
        if (cached && cached.snippet && cached.snippet.trim()) {
          cachedDetails.push(cached);
        } else {
          missingUids.push(uid);
        }
      }

      // Даже если детали уже есть в кэше, вернём их клиенту,
      // чтобы список мог сразу показать preview/snippet.
      if (cachedDetails.length > 0) {
        const withLabels = attachLabelsToEmails(cachedDetails, folder);
        emails.push(...withLabels);
      }

      if (missingUids.length === 0) continue;

      const batch = await fetchEmailsBatch(
        account,
        folder,
        missingUids.slice(0, 15)
      );
      const withLabels = attachLabelsToEmails(batch, folder);

      for (const detail of withLabels) {
        storeCachedEmailDetail(detail, folder);
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
