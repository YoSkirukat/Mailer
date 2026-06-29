import { NextResponse } from "next/server";
import { createMailTemplate, listMailTemplates } from "@/lib/templates-db";
import type { MailTemplateInput } from "@/lib/types";

export async function GET() {
  try {
    return NextResponse.json(listMailTemplates());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MailTemplateInput;
    const template = createMailTemplate(body);
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Не удалось создать шаблон",
      },
      { status: 400 }
    );
  }
}
