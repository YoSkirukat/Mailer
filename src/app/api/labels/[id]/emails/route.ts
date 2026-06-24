import { NextResponse } from "next/server";
import {
  attachAllLabelsToEmails,
  getEmailRefsForLabel,
  listLabels,
} from "@/lib/labels-db";
import { fetchEmailsFromRefs, searchEmailsFromRefs } from "@/lib/labeled-emails";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const label = listLabels().find((l) => l.id === id);
    if (!label) {
      return NextResponse.json({ error: "Ярлык не найден" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const query = searchParams.get("q")?.trim() || "";

    const refs = getEmailRefsForLabel(id, accountId);
    const emails = query
      ? await searchEmailsFromRefs(refs, query)
      : await fetchEmailsFromRefs(refs);
    const emailsWithLabels = attachAllLabelsToEmails(emails);

    return NextResponse.json({ emails: emailsWithLabels, label });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}
