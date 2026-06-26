import { extractEmailAddress, formatPeerDisplayName } from "@/lib/email-utils";
import { FAVICON_DATA_URL } from "@/lib/favicon";
import type { EmailSummary } from "@/lib/types";

export function emailNotificationKey(email: EmailSummary): string {
  return `${email.accountId}:${email.uid}`;
}

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

function focusAppWindow() {
  window.focus();
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent("mailer:focus-inbox"));
  }
}

export function notifyNewEmails(emails: EmailSummary[]): void {
  if (!isNotificationSupported() || Notification.permission !== "granted") return;
  if (emails.length === 0) return;

  if (emails.length > 3) {
    const notification = new Notification(`${emails.length} новых писем`, {
      body: "Откройте почту, чтобы прочитать",
      icon: FAVICON_DATA_URL,
      tag: "mailer-new-mail-batch",
    });
    notification.onclick = () => {
      focusAppWindow();
      notification.close();
    };
    return;
  }

  for (const email of emails) {
    const from =
      formatPeerDisplayName(email.from) ||
      extractEmailAddress(email.from) ||
      email.from;
    const notification = new Notification(email.subject?.trim() || "Без темы", {
      body: email.snippet ? `${from} — ${email.snippet}` : from,
      icon: FAVICON_DATA_URL,
      tag: emailNotificationKey(email),
    });
    notification.onclick = () => {
      focusAppWindow();
      notification.close();
    };
  }
}

export function collectNewInboxEmails(
  inboxEmails: EmailSummary[],
  knownKeys: ReadonlySet<string>
): EmailSummary[] {
  return inboxEmails.filter(
    (email) =>
      !knownKeys.has(emailNotificationKey(email)) && !email.seen
  );
}

export async function fetchInboxEmails(
  accountId?: string | null
): Promise<EmailSummary[]> {
  try {
    const params = new URLSearchParams({ folder: "inbox" });
    if (accountId) params.set("accountId", accountId);
    const res = await fetch(`/api/emails?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data.emails || [];
  } catch {
    return [];
  }
}
