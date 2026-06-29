import { NextResponse } from "next/server";
import { createMailFilter, listMailFilters } from "@/lib/filters-db";
import { scheduleFilterBaseline } from "@/lib/filter-engine";
import type { MailFilterInput } from "@/lib/types";

export async function GET() {
  try {
    return NextResponse.json(listMailFilters());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MailFilterInput;
    const filter = createMailFilter(body);
    scheduleFilterBaseline(filter.id);
    return NextResponse.json(filter, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Не удалось создать фильтр",
      },
      { status: 400 }
    );
  }
}
