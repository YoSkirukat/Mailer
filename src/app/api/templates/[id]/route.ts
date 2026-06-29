import { NextResponse } from "next/server";
import { deleteMailTemplate, updateMailTemplate } from "@/lib/templates-db";
import type { MailTemplateInput } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as MailTemplateInput;
    const template = updateMailTemplate(id, body);
    if (!template) {
      return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });
    }
    return NextResponse.json(template);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Не удалось обновить шаблон",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const deleted = deleteMailTemplate(id);
    if (!deleted) {
      return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}
