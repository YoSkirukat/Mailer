import type { AccountWithPassword } from "./db";
import { getAccountWithPassword, listAccounts } from "./db";
import { assignLabel } from "./labels-db";
import {
  folderIdFromActionValue,
  recordFilterApplied,
  recordFilterAppliedBatch,
  setMailFilterBaselinePending,
  wasFilterApplied,
} from "./filters-db";
import type { MailFolderId } from "./folders";
import {
  deleteEmail,
  downloadAttachment,
  fetchEmail,
  fetchSummariesByUids,
  listMailboxUids,
  moveEmail,
  setEmailSeen,
} from "./imap";
import { sendMail, type SendMailAttachment } from "./smtp";
import type {
  EmailAttachment,
  EmailDetail,
  EmailSummary,
  MailFilter,
  MailFilterAction,
  MailFilterRule,
} from "./types";

export interface FilterRunResult {
  emails: EmailSummary[];
  errors: string[];
}

function getFieldValue(email: EmailSummary, field: MailFilterRule["field"]): string {
  switch (field) {
    case "from":
      return email.from;
    case "to":
      return email.to || "";
    case "subject":
      return email.subject;
    case "body":
      return email.snippet || "";
  }
}

function matchRule(email: EmailSummary, rule: MailFilterRule): boolean {
  const hay = getFieldValue(email, rule.field).toLowerCase();
  const needle = rule.value.trim().toLowerCase();
  if (!needle) return false;

  switch (rule.operator) {
    case "contains":
      return hay.includes(needle);
    case "not_contains":
      return !hay.includes(needle);
    case "equals":
      return hay === needle;
    default:
      return false;
  }
}

export function emailMatchesFilter(email: EmailSummary, filter: MailFilter): boolean {
  if (!filter.enabled) return false;
  if (filter.matchMode === "all_messages") return true;
  if (filter.rules.length === 0) return false;
  if (filter.matchMode === "all") {
    return filter.rules.every((rule) => matchRule(email, rule));
  }
  return filter.rules.some((rule) => matchRule(email, rule));
}

function shouldRunFilter(
  email: EmailSummary,
  filter: MailFilter,
  accountId: string,
  folderId: MailFolderId
): boolean {
  if (!emailMatchesFilter(email, filter)) return false;
  return !wasFilterApplied(filter.id, accountId, folderId, email.uid);
}

function buildForwardBody(
  email: EmailSummary,
  detail?: EmailDetail
): string {
  return (
    detail?.text ||
    (typeof detail?.html === "string"
      ? detail.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : "") ||
    email.snippet ||
    "(письмо без текста)"
  );
}

async function loadForwardAttachments(
  account: AccountWithPassword,
  folderId: MailFolderId,
  uid: number,
  attachments: EmailAttachment[] = []
): Promise<SendMailAttachment[]> {
  if (attachments.length === 0) return [];

  const files = await Promise.all(
    attachments.map((attachment) =>
      downloadAttachment(
        account,
        folderId,
        uid,
        attachment.partId,
        attachment.filename
      )
    )
  );

  return files
    .filter((file): file is NonNullable<typeof file> => file !== null)
    .map((file) => ({
      filename: file.filename,
      content: file.content,
      contentType: file.contentType,
    }));
}

interface ActionResult {
  removed: boolean;
  markedSeen: boolean;
  errors: string[];
}

async function executeAction(
  account: AccountWithPassword,
  email: EmailSummary,
  action: MailFilterAction,
  folderId: MailFolderId,
  detail?: EmailDetail
): Promise<{ removed: boolean; markedSeen: boolean }> {
  switch (action.type) {
    case "move_to": {
      const target = folderIdFromActionValue(action.value);
      if (!target) return { removed: false, markedSeen: false };
      await moveEmail(account, folderId, target, email.uid);
      return { removed: true, markedSeen: false };
    }
    case "delete":
      await deleteEmail(account, folderId, email.uid);
      return { removed: true, markedSeen: false };
    case "mark_read":
      if (!email.seen) {
        await setEmailSeen(account, folderId, email.uid, true);
      }
      return { removed: false, markedSeen: true };
    case "forward_to": {
      const to = action.value.trim();
      if (!to) return { removed: false, markedSeen: false };

      let messageDetail = detail;
      if (!messageDetail) {
        messageDetail =
          (await fetchEmail(account, folderId, email.uid, false)) ?? undefined;
      }

      const body = buildForwardBody(email, messageDetail);
      const attachments = await loadForwardAttachments(
        account,
        folderId,
        email.uid,
        messageDetail?.attachments
      );
      await sendMail(account, {
        to,
        subject: `Fwd: ${email.subject}`,
        text: [
          `---------- Пересланное сообщение ----------`,
          `От: ${email.from}`,
          `Кому: ${messageDetail?.to || email.to || ""}`,
          `Дата: ${email.date}`,
          `Тема: ${email.subject}`,
          ``,
          body,
        ].join("\n"),
        attachments,
      });
      return { removed: false, markedSeen: false };
    }
    case "set_label": {
      const labelId = action.value.trim();
      if (!labelId) return { removed: false, markedSeen: false };
      assignLabel(
        { accountId: account.id, folder: folderId, uid: email.uid },
        labelId
      );
      return { removed: false, markedSeen: false };
    }
    default:
      return { removed: false, markedSeen: false };
  }
}

async function executeFilterActions(
  account: AccountWithPassword,
  email: EmailSummary,
  filter: MailFilter,
  folderId: MailFolderId
): Promise<ActionResult> {
  let removed = false;
  let markedSeen = false;
  const errors: string[] = [];
  let detail: EmailDetail | undefined;

  const needsForward = filter.actions.some(
    (action) => action.type === "forward_to"
  );

  if (needsForward) {
    try {
      detail =
        (await fetchEmail(account, folderId, email.uid, false)) ?? undefined;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Не удалось загрузить письмо";
      errors.push(`Пересылка: ${message}`);
      console.error("[filter] prefetch failed:", error);
    }
  }

  for (const action of filter.actions) {
    try {
      if (action.type === "mark_read" && email.seen) {
        continue;
      }

      const result = await executeAction(
        account,
        email,
        action,
        folderId,
        detail
      );
      removed = removed || result.removed;
      markedSeen = markedSeen || result.markedSeen;
      if (removed) break;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Неизвестная ошибка";
      errors.push(`${action.type}: ${message}`);
      console.error(`[filter] action ${action.type} failed:`, error);
    }
  }

  recordFilterApplied(filter.id, account.id, folderId, email.uid);

  return { removed, markedSeen, errors };
}

async function processEmailsWithFilters(
  account: AccountWithPassword,
  folderId: MailFolderId,
  emails: EmailSummary[],
  filters: MailFilter[]
): Promise<FilterRunResult> {
  const remaining: EmailSummary[] = [];
  const errors: string[] = [];

  for (const email of emails) {
    let current = email;
    let removed = false;

    for (const filter of filters) {
      if (!shouldRunFilter(current, filter, account.id, folderId)) {
        continue;
      }

      const result = await executeFilterActions(
        account,
        current,
        filter,
        folderId
      );
      removed = result.removed;
      if (result.markedSeen) {
        current = { ...current, seen: true };
      }
      if (result.errors.length > 0) {
        errors.push(
          ...result.errors.map(
            (error) => `Фильтр «${filter.name}»: ${error}`
          )
        );
      }
      break;
    }

    if (!removed) {
      remaining.push(current);
    }
  }

  return { emails: remaining, errors };
}

export async function applyMailFilters(
  account: AccountWithPassword,
  folderId: MailFolderId,
  emails: EmailSummary[],
  filters: MailFilter[]
): Promise<FilterRunResult> {
  if (folderId !== "inbox" || filters.length === 0) {
    return { emails, errors: [] };
  }

  return processEmailsWithFilters(account, folderId, emails, filters);
}

export async function applyMailFiltersForUid(
  account: AccountWithPassword,
  folderId: MailFolderId,
  uid: number,
  filters: MailFilter[]
): Promise<Pick<FilterRunResult, "errors">> {
  if (folderId !== "inbox" || filters.length === 0) {
    return { errors: [] };
  }

  const summaries = await fetchSummariesByUids(account, folderId, [uid]);
  if (summaries.length === 0) {
    return { errors: [] };
  }

  const result = await processEmailsWithFilters(
    account,
    folderId,
    summaries,
    filters
  );
  return { errors: result.errors };
}

/** Помечает все текущие письма во входящих как уже обработанные фильтром (без действий). */
export async function baselineFilterInbox(filterId: string): Promise<void> {
  const accounts = listAccounts();

  const results = await Promise.allSettled(
    accounts.map(async (account) => {
      const full = getAccountWithPassword(account.id);
      if (!full) return [] as Array<{ accountId: string; folder: string; uid: number }>;

      const uids = await listMailboxUids(full, "inbox");
      return uids.map((uid) => ({
        accountId: account.id,
        folder: "inbox",
        uid,
      }));
    })
  );

  const entries = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[filter] не удалось получить входящие:", result.reason);
    }
  }

  recordFilterAppliedBatch(filterId, entries);
}

const baselineInFlight = new Set<string>();

/** Запускает baseline в фоне, не блокируя ответ API. */
export function scheduleFilterBaseline(filterId: string): void {
  if (baselineInFlight.has(filterId)) return;
  baselineInFlight.add(filterId);

  void (async () => {
    try {
      await baselineFilterInbox(filterId);
    } catch (error) {
      console.error("[filter] baseline failed:", error);
    } finally {
      setMailFilterBaselinePending(filterId, false);
      baselineInFlight.delete(filterId);
    }
  })();
}
