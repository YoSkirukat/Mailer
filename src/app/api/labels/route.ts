import { NextResponse } from "next/server";
import { createLabel, listLabels } from "@/lib/labels-db";
import type { MailLabelInput } from "@/lib/types";

export async function GET() {
  try {
    return NextResponse.json(listLabels());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MailLabelInput;
    const label = createLabel(body);
    return NextResponse.json(label, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось создать ярлык" },
      { status: 400 }
    );
  }
}
