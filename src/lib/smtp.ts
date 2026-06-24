import nodemailer from "nodemailer";
import type { AccountWithPassword } from "./db";
import { isSmtpSecure, tlsOptions } from "./mail-config";

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
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

export async function sendMail(
  account: AccountWithPassword,
  input: SendMailInput
): Promise<void> {
  const transporter = createTransporter(account);

  await transporter.sendMail({
    from: {
      name: (account.fromName || account.name).trim(),
      address: account.email,
    },
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}

export async function testSmtpConnection(
  account: AccountWithPassword
): Promise<void> {
  const transporter = createTransporter(account);
  await transporter.verify();
}
