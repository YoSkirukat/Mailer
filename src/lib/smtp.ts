import { randomUUID } from "crypto";
import nodemailer, { type SendMailOptions } from "nodemailer";

import type { AccountWithPassword } from "./db";
import { appendToSentFolder } from "./imap";
import { isSmtpSecure, tlsOptions } from "./mail-config";

export interface SendMailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
  cid?: string;
}

export interface SendMailInput {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: SendMailAttachment[];
}

function createTransporter(account: AccountWithPassword) {
  const tls = tlsOptions(account.ignoreTlsErrors);
  return nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: isSmtpSecure(account.smtpPort),
    auth: { user: account.email, pass: account.password },
    ...(tls ? { tls } : {}),
  });
}

function parseRecipients(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildEnvelopeRecipients(input: SendMailInput): string[] {
  return [
    ...parseRecipients(input.to),
    ...(input.cc ? parseRecipients(input.cc) : []),
    ...(input.bcc ? parseRecipients(input.bcc) : []),
  ];
}

function buildMailOptions(
  account: AccountWithPassword,
  input: SendMailInput
): SendMailOptions {
  const domain = account.email.split("@")[1] || "local";
  return {
    from: {
      name: (account.fromName || account.name).trim(),
      address: account.email,
    },
    to: input.to,
    ...(input.cc ? { cc: input.cc } : {}),
    ...(input.bcc ? { bcc: input.bcc } : {}),
    subject: input.subject,
    text: input.text,
    ...(input.html ? { html: input.html } : {}),
    ...(input.attachments?.length
      ? {
          attachments: input.attachments.map((attachment) => ({
            filename: attachment.filename,
            content: attachment.content,
            contentType: attachment.contentType || "application/octet-stream",
            ...(attachment.cid
              ? { cid: attachment.cid, contentDisposition: "inline" as const }
              : {}),
          })),
        }
      : {}),
    messageId: `<${randomUUID()}@${domain}>`,
    date: new Date(),
  };
}

async function compileMimeMessage(mailOptions: SendMailOptions): Promise<Buffer> {
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "unix",
  });

  const info = await transport.sendMail(mailOptions);
  if (!Buffer.isBuffer(info.message)) {
    throw new Error("Не удалось собрать MIME-письмо");
  }
  return info.message;
}

export async function sendMail(
  account: AccountWithPassword,
  input: SendMailInput
) {
  const mailOptions = buildMailOptions(account, input);
  const raw = await compileMimeMessage(mailOptions);
  const transporter = createTransporter(account);

  const info = await transporter.sendMail({
    envelope: {
      from: account.email,
      to: buildEnvelopeRecipients(input),
    },
    raw,
  });

  if (!info.messageId) {
    throw new Error("SMTP-сервер не подтвердил отправку письма");
  }

  void appendToSentFolder(account, raw).catch((error) => {
    console.error("[smtp] не удалось сохранить копию в отправленные:", error);
  });

  return info;
}

export function formatSmtpErrorMessage(error: unknown): string {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "ETIMEDOUT") {
    return "Таймаут подключения к SMTP-серверу";
  }
  if (code === "ECONNRESET") {
    return "Соединение с SMTP-сервером разорвано";
  }
  if (code === "ENOTFOUND") {
    return "SMTP-сервер не найден";
  }

  const message =
    error instanceof Error ? error.message.trim().toLowerCase() : "";
  if (message.includes("invalid login") || message.includes("authentication")) {
    return "Неверный логин или пароль SMTP. Для Mail.ru и Gmail используйте пароль приложения.";
  }
  if (message === "command failed") {
    return "SMTP-сервер отклонил команду. Попробуйте порт 587 вместо 465 или проверьте пароль приложения.";
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "Ошибка подключения к SMTP";
}

export async function testSmtpConnection(
  account: AccountWithPassword
): Promise<void> {
  const transporter = createTransporter(account);
  await transporter.verify();
}
