import { NextResponse } from "next/server";
import { deleteLabel, updateLabel } from "@/lib/labels-db";
import type { MailLabelInput } from "@/lib/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Partial<MailLabelInput>;
    const label = updateLabel(id, body);
    if (!label) {
      return NextResponse.json({ error: "Ярлык не найден" }, { status: 404 });
    }
    return NextResponse.json(label);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось обновить" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = deleteLabel(id);
    if (!deleted) {
      return NextResponse.json({ error: "Ярлык не найден" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}
