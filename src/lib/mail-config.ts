import type { AccountWithPassword } from "./db";

/** IMAPS (993) / POP3S (995) — шифрование с первого байта */
export function isImapSecure(port: number): boolean {
  return port === 993 || port === 995;
}

/** SMTPS (465) — шифрование с первого байта; 587 использует STARTTLS */
export function isSmtpSecure(port: number): boolean {
  return port === 465;
}

export function tlsOptions(ignoreTlsErrors: boolean) {
  if (!ignoreTlsErrors) return undefined;
  return { rejectUnauthorized: false as const };
}

export type MailAccountConnection = AccountWithPassword & {
  ignoreTlsErrors: boolean;
};
