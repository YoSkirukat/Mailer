import { NextResponse } from "next/server";
import { createAccount, listAccounts } from "@/lib/db";
import { testImapConnection } from "@/lib/imap";
import { testSmtpConnection } from "@/lib/smtp";
import type { MailAccountInput } from "@/lib/types";

export async function GET() {
  try {
    return NextResponse.json(listAccounts());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MailAccountInput;

    if (!body.name?.trim() || !body.email?.trim() || !body.password) {
      return NextResponse.json(
        { error: "Заполните имя, email и пароль" },
        { status: 400 }
      );
    }

    const testAccount = {
      id: "test",
      name: body.name.trim(),
      fromName: "",
      email: body.email.trim().toLowerCase(),
      password: body.password,
      color: "#3b82f6",
      signature: "",
      imapHost: body.imapHost.trim(),
      imapPort: body.imapPort,
      smtpHost: body.smtpHost.trim(),
      smtpPort: body.smtpPort,
      ignoreTlsErrors: Boolean(body.ignoreTlsErrors),
      createdAt: new Date().toISOString(),
    };

    await testImapConnection(testAccount);
    await testSmtpConnection(testAccount);

    const account = createAccount(body);
    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    const raw =
      error instanceof Error ? error.message : "Не удалось добавить ящик";
    const message = raw.toLowerCase().includes("certificate")
      ? "Ошибка сертификата TLS. Включите «Игнорировать ошибки сертификата» для корпоративных серверов."
      : raw;
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
