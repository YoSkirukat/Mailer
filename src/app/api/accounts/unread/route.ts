import { NextResponse } from "next/server";
import { getAccountWithPassword, listAccounts } from "@/lib/db";
import { getFolderUnreadCount } from "@/lib/imap";

export async function GET() {
  try {
    const accounts = listAccounts();
    const counts: Record<string, number> = {};

    const results = await Promise.allSettled(
      accounts.map(async (acc) => {
        const full = getAccountWithPassword(acc.id);
        if (!full) return { id: acc.id, count: 0 };
        const count = await getFolderUnreadCount(full, "inbox");
        return { id: acc.id, count };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        counts[result.value.id] = result.value.count;
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
