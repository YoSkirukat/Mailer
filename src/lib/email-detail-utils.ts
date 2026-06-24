import type { MailFolderId } from "./folders";
import type { EmailDetail, EmailSummary } from "./types";

export function emailDetailKey(
  summary: Pick<EmailSummary, "accountId" | "uid" | "folder">,
  folderFallback: MailFolderId
): string {
  const folder = (summary.folder as MailFolderId) || folderFallback;
  return `${summary.accountId}:${folder}:${summary.uid}`;
}

export function summaryToPartialDetail(
  summary: EmailSummary,
  folder: MailFolderId
): EmailDetail {
  return {
    ...summary,
    folder,
    to: summary.to || "",
    text: summary.snippet || undefined,
  };
}
