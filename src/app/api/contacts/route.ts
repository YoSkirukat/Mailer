import { NextResponse } from "next/server";
import { createContact, listContacts } from "@/lib/contacts-db";

export async function GET() {
  try {
    return NextResponse.json(listContacts());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Укажите корректный email" },
        { status: 400 }
      );
    }

    const { contact, created } = createContact({ name, email });
    return NextResponse.json({ ...contact, created });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}
