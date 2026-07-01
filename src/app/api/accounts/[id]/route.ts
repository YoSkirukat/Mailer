import { NextResponse } from "next/server";
import { deleteAccount, updateAccount } from "@/lib/db";
import { clearCachedMessagesForAccount } from "@/lib/mail-cache-db";
import { clearCachedMessageDetailsForAccount } from "@/lib/mail-detail-cache-db";
import type { MailAccountUpdate } from "@/lib/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as MailAccountUpdate;

    if (body.name !== undefined && !body.name.trim()) {
      return NextResponse.json(
        { error: "Укажите название ящика" },
        { status: 400 }
      );
    }

    const updated = updateAccount(id, {
      name: body.name?.trim(),
      fromName: body.fromName?.trim(),
      color: body.color?.trim(),
      signature: body.signature,
    });

    if (!updated) {
      return NextResponse.json({ error: "Аккаунт не найден" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    clearCachedMessagesForAccount(id);
    clearCachedMessageDetailsForAccount(id);
    const deleted = deleteAccount(id);
    if (!deleted) {
      return NextResponse.json({ error: "Аккаунт не найден" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}
