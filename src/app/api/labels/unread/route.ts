import { NextResponse } from "next/server";
import {
  getEmailRefsGroupedByLabel,
  listLabels,
} from "@/lib/labels-db";
import { countUnreadPerLabel } from "@/lib/labeled-emails";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    const labels = listLabels();
    const grouped = getEmailRefsGroupedByLabel(accountId);
    const unreadMap = await countUnreadPerLabel(grouped);

    const counts: Record<string, number> = {};
    for (const label of labels) {
      counts[label.id] = unreadMap[label.id] ?? 0;
    }

    return NextResponse.json(counts);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}
