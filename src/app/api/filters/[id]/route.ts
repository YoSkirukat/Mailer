import { NextResponse } from "next/server";
import {
  deleteMailFilter,
  setMailFilterEnabled,
  updateMailFilter,
} from "@/lib/filters-db";
import type { MailFilterInput } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Partial<MailFilterInput> & {
      enabled?: boolean;
    };

    if (
      body.enabled !== undefined &&
      Object.keys(body).length === 1
    ) {
      const filter = setMailFilterEnabled(id, body.enabled);
      if (!filter) {
        return NextResponse.json({ error: "Фильтр не найден" }, { status: 404 });
      }
      return NextResponse.json(filter);
    }

    if (
      body.name === undefined ||
      body.matchMode === undefined ||
      body.rules === undefined ||
      body.actions === undefined ||
      body.enabled === undefined
    ) {
      return NextResponse.json(
        { error: "Неполные данные фильтра" },
        { status: 400 }
      );
    }

    const filter = updateMailFilter(id, body as MailFilterInput);
    if (!filter) {
      return NextResponse.json({ error: "Фильтр не найден" }, { status: 404 });
    }
    return NextResponse.json(filter);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Не удалось обновить фильтр",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const deleted = deleteMailFilter(id);
    if (!deleted) {
      return NextResponse.json({ error: "Фильтр не найден" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}
