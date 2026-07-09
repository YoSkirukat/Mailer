import { ImapFlow, type SearchObject } from "imapflow";
import { simpleParser } from "mailparser";
import type { AccountWithPassword } from "./db";
import {
  EMPTY_UNREAD_COUNTS,
  MAIL_FOLDERS,
  type MailFolderId,
  resolveMailbox,
  SEARCHABLE_FOLDERS,
} from "./folders";
import {
  collectAttachmentsFromStructure,
  dedupeAttachments,
  findStructurePartByFilename,
  hasAttachmentsInStructure,
  normalizeFilename,
  shouldIncludeParsedAttachment,
  type BodyStructureNode,
} from "./attachments";
import { isImapSecure, tlsOptions } from "./mail-config";
import { extractEmailAddress } from "./email-utils";
import { htmlToPlainText } from "./html-utils";
import type { EmailDetail, EmailSummary, EmailAttachment } from "./types";
import type { AddressObject, Headers, ParsedMail } from "mailparser";

const IMAP_MAX_CONCURRENT = 3;
let imapInFlight = 0;
const imapHighWaiters: Array<() => void> = [];
const imapLowWaiters: Array<() => void> = [];

export type ImapPriority = "high" | "low";

function acquireImapSlot(priority: ImapPriority = "low"): Promise<void> {
  if (imapInFlight < IMAP_MAX_CONCURRENT) {
    imapInFlight++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const queue = priority === "high" ? imapHighWaiters : imapLowWaiters;
    queue.push(() => {
      imapInFlight++;
      resolve();
    });
  });
}

function releaseImapSlot(): void {
  imapInFlight = Math.max(0, imapInFlight - 1);
  const next = imapHighWaiters.shift() ?? imapLowWaiters.shift();
  if (next) next();
}

async function withImapSlot<T>(
  fn: () => Promise<T>,
  priority: ImapPriority = "low"
): Promise<T> {
  await acquireImapSlot(priority);
  try {
    return await fn();
  } finally {
    releaseImapSlot();
  }
}

function createImapClient(account: AccountWithPassword) {
  const tls = tlsOptions(account.ignoreTlsErrors);
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: isImapSecure(account.imapPort),
    auth: { user: account.email, pass: account.password },
    logger: false,
    connectionTimeout: 30_000,
    greetingTimeout: 20_000,
    ...(tls ? { tls } : {}),
  });
  client.on("error", () => {
    /* подавляем uncaughtException при обрыве сокета */
  });
  return client;
}

function isTransientImapError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "EPIPE"
  ) {
    return true;
  }
  if (error instanceof AggregateError) {
    return error.errors.some(isTransientImapError);
  }
  return false;
}

export function formatImapErrorMessage(error: unknown): string {
  if (error instanceof AggregateError) {
    const nested = error.errors
      .map((item) => formatImapErrorMessage(item))
      .filter((item) => item && item !== "Ошибка загрузки");
    if (nested.length > 0) return nested.join("; ");
    if ((error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
      return "Таймаут подключения к почтовому серверу";
    }
  }

  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "ETIMEDOUT") {
    return "Таймаут подключения к почтовому серверу";
  }
  if (code === "ECONNRESET") {
    return "Соединение с сервером разорвано";
  }
  if (code === "ENOTFOUND") {
    return "Почтовый сервер не найден";
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "Ошибка загрузки";
}

async function safeLogout(client: ImapFlow): Promise<void> {
  try {
    await client.logout();
  } catch {
    /* соединение уже закрыто */
  }
}

async function connectAccount(
  account: AccountWithPassword,
  retries = 2
): Promise<ImapFlow> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const client = createImapClient(account);
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await safeLogout(client);
      if (!isTransientImapError(error) || attempt === retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function withMailbox<T>(
  account: AccountWithPassword,
  folderId: MailFolderId,
  fn: (client: ImapFlow) => Promise<T>,
  priority: ImapPriority = "low"
): Promise<T> {
  return withImapSlot(async () => {
    const client = await connectAccount(account);
    try {
      const mailbox = await resolveMailbox(client, folderId, account.email);
      if (!mailbox) {
        throw new Error(`Папка «${folderId}» не найдена на сервере`);
      }
      const lock = await client.getMailboxLock(mailbox);
      try {
        return await fn(client);
      } finally {
        lock.release();
      }
    } finally {
      await safeLogout(client);
    }
  }, priority);
}

function formatAddress(
  addr?: { name?: string | null; address?: string | null } | null
): string {
  if (!addr) return "Неизвестный";
  return addr.name
    ? `${addr.name} <${addr.address}>`
    : addr.address || "Неизвестный";
}

function formatAddressList(
  list?: { name?: string | null; address?: string | null }[] | null
): string {
  if (!list?.length) return "";
  return list.map((a) => formatAddress(a)).filter(Boolean).join(", ");
}

const ORIGINAL_FROM_HEADER_KEYS = [
  "x-original-from",
  "x-original-sender",
  "x-real-from",
  "x-forwarded-from",
  "resent-from",
  "x-mru-orig-from",
];

function headerFirstValue(headers: Headers, name: string): string | undefined {
  const raw = headers.get(name.toLowerCase());
  if (!raw) return undefined;
  const value = Array.isArray(raw) ? raw[raw.length - 1] : raw;
  return typeof value === "string" ? value.trim() : undefined;
}

function formatParsedAddressField(
  field: AddressObject | AddressObject[] | undefined
): string | undefined {
  if (!field) return undefined;
  const obj = Array.isArray(field) ? field[0] : field;
  if (obj.text?.trim()) return obj.text.trim();
  const first = obj.value?.[0];
  if (!first?.address) return undefined;
  return first.name ? `${first.name} <${first.address}>` : first.address;
}

function extractOriginalFromHeaders(headers: Headers): string | undefined {
  for (const key of ORIGINAL_FROM_HEADER_KEYS) {
    const value = headerFirstValue(headers, key);
    if (value) return value;
  }
  return undefined;
}

async function extractFromRfc822Attachments(
  parsed: ParsedMail
): Promise<string | undefined> {
  for (const attachment of parsed.attachments ?? []) {
    if (!attachment.content) continue;
    const contentType = (attachment.contentType || "").toLowerCase();
    if (!contentType.startsWith("message/rfc822")) continue;
    try {
      const nested = await simpleParser(attachment.content);
      const from = formatParsedAddressField(nested.from);
      if (from) return from;
    } catch {
      /* вложенное письмо не разобралось */
    }
  }
  return undefined;
}

async function extractReplyMetadata(
  parsed: ParsedMail,
  envelopeFrom: string
): Promise<{
  replyToHeader?: string;
  originalFromHeader?: string;
}> {
  const replyToHeader = formatParsedAddressField(parsed.replyTo);
  let originalFromHeader = extractOriginalFromHeaders(parsed.headers);
  if (!originalFromHeader) {
    originalFromHeader = await extractFromRfc822Attachments(parsed);
  }
  const mimeFrom = formatParsedAddressField(parsed.from);
  if (
    mimeFrom &&
    extractEmailAddress(mimeFrom).toLowerCase() !==
      extractEmailAddress(envelopeFrom).toLowerCase()
  ) {
    originalFromHeader = originalFromHeader || mimeFrom;
  }
  return { replyToHeader, originalFromHeader };
}

function buildSummaryFromMessage(
  account: AccountWithPassword,
  folderId: MailFolderId,
  message: {
    uid: number;
    envelope?: {
      subject?: string | null;
      from?: { name?: string | null; address?: string | null }[] | null;
      to?: { name?: string | null; address?: string | null }[] | null;
      date?: Date | null;
    };
    flags?: Set<string>;
    bodyStructure?: BodyStructureNode;
  }
): EmailSummary {
  const isSent = folderId === "sent";
  const from = isSent
    ? formatAddressList(message.envelope?.to) || "Неизвестный"
    : formatAddress(message.envelope?.from?.[0]);

  return {
    uid: message.uid,
    accountId: account.id,
    accountEmail: account.email,
    accountName: account.name,
    accountColor: account.color,
    subject: message.envelope?.subject || "(без темы)",
    from,
    to: formatAddressList(message.envelope?.to),
    date: message.envelope?.date?.toISOString() || new Date().toISOString(),
    seen: message.flags?.has("\\Seen") ?? false,
    answered: message.flags?.has("\\Answered") ?? false,
    hasAttachments: hasAttachmentsInStructure(
      message.bodyStructure as BodyStructureNode | undefined
    ),
    snippet: "",
    folder: folderId,
  };
}

const SUMMARY_FETCH_QUERY = {
  uid: true,
  envelope: true,
  flags: true,
  bodyStructure: true,
} as const;

async function fetchSummariesForUids(
  client: ImapFlow,
  account: AccountWithPassword,
  folderId: MailFolderId,
  uids: number[]
): Promise<EmailSummary[]> {
  if (uids.length === 0) return [];

  const emails: EmailSummary[] = [];
  const range = uids.join(",");

  for await (const message of client.fetch(
    range,
    SUMMARY_FETCH_QUERY,
    { uid: true }
  )) {
    emails.push(buildSummaryFromMessage(account, folderId, message));
  }

  return emails;
}

export async function fetchSummariesByUids(
  account: AccountWithPassword,
  folderId: MailFolderId,
  uids: number[]
): Promise<EmailSummary[]> {
  if (uids.length === 0) return [];

  return withMailbox(account, folderId, async (client) =>
    fetchSummariesForUids(client, account, folderId, uids)
  );
}

export async function countUnreadByUids(
  account: AccountWithPassword,
  folderId: MailFolderId,
  uids: number[]
): Promise<number> {
  if (uids.length === 0) return 0;

  return withMailbox(account, folderId, async (client) => {
    let count = 0;
    const range = uids.join(",");

    for await (const message of client.fetch(range, {
      uid: true,
      flags: true,
    }, { uid: true })) {
      if (!message.flags?.has("\\Seen")) count++;
    }

    return count;
  });
}

export async function listMailboxUids(
  account: AccountWithPassword,
  folderId: MailFolderId
): Promise<number[]> {
  return withMailbox(account, folderId, async (client) => {
    const uids = await client.search({ all: true }, { uid: true });
    return Array.isArray(uids) ? uids : [];
  });
}

export async function fetchMailbox(
  account: AccountWithPassword,
  folderId: MailFolderId,
  limit = 50,
  offset = 0
): Promise<{ emails: EmailSummary[]; hasMore: boolean }> {
  return withMailbox(account, folderId, async (client) => {
    const mbox = client.mailbox;
    const total = mbox === false ? 0 : mbox.exists ?? 0;
    if (total === 0) return { emails: [], hasMore: false };

    const endSeq = total - offset;
    if (endSeq < 1) return { emails: [], hasMore: false };

    const startSeq = Math.max(1, endSeq - limit + 1);
    const range = `${startSeq}:${endSeq}`;
    const emails: EmailSummary[] = [];

    for await (const message of client.fetch(range, SUMMARY_FETCH_QUERY)) {
      emails.push(buildSummaryFromMessage(account, folderId, message));
    }

    return {
      emails: emails.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
      hasMore: startSeq > 1,
    };
  });
}

async function searchUnseenUids(client: ImapFlow): Promise<number[]> {
  for (const criteria of [{ unseen: true }, { seen: false }] as const) {
    try {
      const uids = await client.search(criteria, { uid: true });
      if (uids && uids.length > 0) return uids;
    } catch {
      /* пробуем следующий критерий */
    }
  }
  return [];
}

async function fetchUnreadFromFlagsScan(
  client: ImapFlow,
  account: AccountWithPassword,
  folderId: MailFolderId,
  limit: number
): Promise<EmailSummary[]> {
  const mbox = client.mailbox;
  const total = mbox === false ? 0 : mbox.exists ?? 0;
  if (total === 0) return [];

  const scanSize = Math.min(total, 500);
  const start = Math.max(1, total - scanSize + 1);
  const emails: EmailSummary[] = [];

  for await (const message of client.fetch(`${start}:${total}`, SUMMARY_FETCH_QUERY)) {
    if (message.flags?.has("\\Seen")) continue;
    emails.push(buildSummaryFromMessage(account, folderId, message));
  }

  return emails
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}

export async function fetchUnreadMailbox(
  account: AccountWithPassword,
  folderId: MailFolderId,
  limit = 50
): Promise<EmailSummary[]> {
  return withMailbox(account, folderId, async (client) => {
    const uids = await searchUnseenUids(client);

    if (uids.length === 0) {
      const currentMbox = client.mailbox;
      const path = currentMbox === false ? undefined : currentMbox.path;
      if (path) {
        try {
          const status = await client.status(path, { unseen: true });
          if ((status.unseen ?? 0) > 0) {
            return fetchUnreadFromFlagsScan(client, account, folderId, limit);
          }
        } catch {
          return fetchUnreadFromFlagsScan(client, account, folderId, limit);
        }
      }
      return [];
    }

    const targetUids =
      uids.length > limit ? uids.slice(uids.length - limit) : uids;

    const emails = await fetchSummariesForUids(
      client,
      account,
      folderId,
      targetUids
    );

    return emails.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  });
}

const SEARCH_RESULT_LIMIT = 50;
const SEARCH_CACHE_MS = 60_000;
const SEARCH_BODY_FOLDERS = new Set<MailFolderId>(["inbox", "sent"]);
const SLOW_SEARCH_FOLDERS = new Set<MailFolderId>(["archive", "trash"]);
const MIN_RESULTS_BEFORE_SLOW_FOLDERS = 8;

const searchResultCache = new Map<
  string,
  { expires: number; emails: EmailSummary[] }
>();

function searchCacheKey(accountId: string, query: string, limit: number): string {
  return `${accountId}:${query.toLowerCase()}:${limit}`;
}

function looksLikeEmailQuery(query: string): boolean {
  return query.includes("@");
}

function mergeUidLists(...lists: number[][]): number[] {
  return [...new Set(lists.flat())];
}

async function tryImapSearch(
  client: ImapFlow,
  criteria: SearchObject
): Promise<number[]> {
  try {
    const uids = await client.search(criteria, { uid: true });
    return uids || [];
  } catch {
    return [];
  }
}

function buildHeaderSearchQuery(query: string): SearchObject {
  return {
    or: [{ from: query }, { to: query }, { subject: query }],
  };
}

interface SearchUidsOptions {
  allowBodySearch?: boolean;
}

async function searchUids(
  client: ImapFlow,
  query: string,
  options: SearchUidsOptions = {}
): Promise<number[]> {
  const q = query.trim();
  if (!q) return [];

  const allowBodySearch = options.allowBodySearch ?? true;

  if (looksLikeEmailQuery(q)) {
    const fromUids = await tryImapSearch(client, { from: q });
    const toUids = await tryImapSearch(client, { to: q });
    const merged = mergeUidLists(fromUids, toUids);
    if (merged.length > 0) return merged;
  }

  const headerUids = await tryImapSearch(client, buildHeaderSearchQuery(q));
  if (headerUids.length > 0) return headerUids;

  if (!allowBodySearch) return [];

  const textUids = await tryImapSearch(client, { text: q });
  if (textUids.length > 0) return textUids;

  return tryImapSearch(client, { subject: q });
}

export async function searchMailboxUids(
  account: AccountWithPassword,
  folderId: MailFolderId,
  query: string
): Promise<number[]> {
  const q = query.trim();
  if (!q) return [];

  return withMailbox(account, folderId, async (client) =>
    searchUids(client, q, { allowBodySearch: SEARCH_BODY_FOLDERS.has(folderId) })
  );
}

export async function searchMailbox(
  account: AccountWithPassword,
  folderId: MailFolderId,
  query: string,
  limit = SEARCH_RESULT_LIMIT
): Promise<EmailSummary[]> {
  const q = query.trim();
  if (!q) {
    const page = await fetchMailbox(account, folderId, limit);
    return page.emails;
  }

  return withMailbox(account, folderId, async (client) => {
    const uids = await searchUids(client, q, {
      allowBodySearch: SEARCH_BODY_FOLDERS.has(folderId),
    });
    if (uids.length === 0) return [];

    const targetUids =
      uids.length > limit ? uids.slice(uids.length - limit) : uids;

    const emails = await fetchSummariesForUids(
      client,
      account,
      folderId,
      targetUids
    );

    return emails.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  });
}

export async function searchAllMailboxes(
  account: AccountWithPassword,
  query: string,
  limit = SEARCH_RESULT_LIMIT
): Promise<EmailSummary[]> {
  const q = query.trim();
  if (!q) return [];

  const cacheKey = searchCacheKey(account.id, q, limit);
  const cached = searchResultCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.emails;
  }

  const emails = await withImapSlot(async () => {
    const client = await connectAccount(account);
    const results: EmailSummary[] = [];

    try {
      for (const folderId of SEARCHABLE_FOLDERS) {
        if (results.length >= limit) break;
        if (
          SLOW_SEARCH_FOLDERS.has(folderId) &&
          results.length >= MIN_RESULTS_BEFORE_SLOW_FOLDERS
        ) {
          continue;
        }

        const mailbox = await resolveMailbox(client, folderId, account.email);
        if (!mailbox) continue;

        const lock = await client.getMailboxLock(mailbox);
        try {
          const uids = await searchUids(client, q, {
            allowBodySearch: SEARCH_BODY_FOLDERS.has(folderId),
          });
          if (uids.length === 0) continue;

          const remaining = limit - results.length;
          const targetUids =
            uids.length > remaining ? uids.slice(uids.length - remaining) : uids;
          const folderEmails = await fetchSummariesForUids(
            client,
            account,
            folderId,
            targetUids
          );
          results.push(...folderEmails);
        } finally {
          lock.release();
        }
      }
    } finally {
      await safeLogout(client);
    }

    return results
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);
  }, "high");

  searchResultCache.set(cacheKey, {
    expires: Date.now() + SEARCH_CACHE_MS,
    emails,
  });

  return emails;
}

function buildAttachmentList(
  structure?: BodyStructureNode,
  parsedAttachments?: {
    filename?: string;
    contentType?: string;
    size?: number;
    contentDisposition?: string;
    contentId?: string;
    related?: boolean;
  }[]
): EmailAttachment[] {
  let attachments = collectAttachmentsFromStructure(structure);

  if (parsedAttachments?.length) {
    const fromParsed = mergeParsedAttachments(parsedAttachments, structure);
    attachments = dedupeAttachments([...attachments, ...fromParsed]);
  }

  return attachments;
}

export async function fetchEmailAttachmentList(
  account: AccountWithPassword,
  folderId: MailFolderId,
  uid: number
): Promise<EmailAttachment[]> {
  return withMailbox(
    account,
    folderId,
    async (client) => {
      const message = await client.fetchOne(
        uid,
        { bodyStructure: true, source: true },
        { uid: true }
      );
      if (!message) return [];

      const parsed = message.source ? await simpleParser(message.source) : null;
      return buildAttachmentList(
        message.bodyStructure as BodyStructureNode | undefined,
        parsed?.attachments
      );
    },
    "high"
  );
}

async function buildEmailDetailFromMessage(
  account: AccountWithPassword,
  folderId: MailFolderId,
  message: {
    uid: number;
    envelope?: {
      subject?: string | null;
      from?: { name?: string | null; address?: string | null }[] | null;
      to?: { name?: string | null; address?: string | null }[] | null;
      date?: Date | null;
    };
    flags?: Set<string>;
    source?: Buffer;
    bodyStructure?: BodyStructureNode;
  },
  seen: boolean
): Promise<EmailDetail | null> {
  if (!message.source) return null;

  const parsed = await simpleParser(message.source);
  const isSent = folderId === "sent";
  const envelopeFrom = formatAddress(message.envelope?.from?.[0]);
  const fromStr = isSent
    ? formatAddressList(message.envelope?.to) || "Неизвестный"
    : envelopeFrom;
  const replyMetadata = await extractReplyMetadata(parsed, envelopeFrom);

  const toList = formatAddressList(message.envelope?.to);

  const attachments = buildAttachmentList(
    message.bodyStructure as BodyStructureNode | undefined,
    parsed.attachments
  );

  return {
    uid: message.uid,
    accountId: account.id,
    accountEmail: account.email,
    accountName: account.name,
    accountColor: account.color,
    subject: message.envelope?.subject || "(без темы)",
    from: isSent ? fromStr : envelopeFrom,
    to: toList,
    replyToHeader: replyMetadata.replyToHeader,
    originalFromHeader: replyMetadata.originalFromHeader,
    date: message.envelope?.date?.toISOString() || new Date().toISOString(),
    seen,
    answered: message.flags?.has("\\Answered") ?? false,
    hasAttachments: attachments.length > 0,
    attachments,
    snippet: (parsed.text ||
      (parsed.html ? htmlToPlainText(parsed.html) : "")
    ).slice(0, 160),
    text: parsed.text || undefined,
    html: parsed.html || undefined,
    folder: folderId,
  };
}

export async function fetchEmail(
  account: AccountWithPassword,
  folderId: MailFolderId,
  uid: number,
  markAsRead = true
): Promise<EmailDetail | null> {
  return withMailbox(account, folderId, async (client) => {
    const message = await client.fetchOne(
      uid,
      { uid: true, envelope: true, flags: true, bodyStructure: true, source: true },
      { uid: true }
    );

    if (!message || !message.source) return null;

    const wasSeen = message.flags?.has("\\Seen") ?? false;
    if (markAsRead && !wasSeen) {
      await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
    }

    return buildEmailDetailFromMessage(
      account,
      folderId,
      message,
      markAsRead ? true : wasSeen
    );
  }, "high");
}

export async function fetchEmailsBatch(
  account: AccountWithPassword,
  folderId: MailFolderId,
  uids: number[]
): Promise<EmailDetail[]> {
  if (uids.length === 0) return [];

  return withMailbox(account, folderId, async (client) => {
    const emails: EmailDetail[] = [];
    const range = uids.join(",");

    for await (const message of client.fetch(
      range,
      {
        uid: true,
        envelope: true,
        flags: true,
        bodyStructure: true,
        source: true,
      },
      { uid: true }
    )) {
      const detail = await buildEmailDetailFromMessage(
        account,
        folderId,
        message,
        message.flags?.has("\\Seen") ?? false
      );
      if (detail) emails.push(detail);
    }

    return emails;
  }, "high");
}

export async function testImapConnection(
  account: AccountWithPassword
): Promise<void> {
  await withImapSlot(async () => {
    const client = await connectAccount(account);
    await safeLogout(client);
  });
}

export async function setEmailSeen(
  account: AccountWithPassword,
  folderId: MailFolderId,
  uid: number,
  seen: boolean
): Promise<void> {
  await withMailbox(account, folderId, async (client) => {
    if (seen) {
      await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
    } else {
      await client.messageFlagsRemove(uid, ["\\Seen"], { uid: true });
    }
  });
}

export async function setEmailAnswered(
  account: AccountWithPassword,
  folderId: MailFolderId,
  uid: number
): Promise<void> {
  await withMailbox(account, folderId, async (client) => {
    await client.messageFlagsAdd(uid, ["\\Answered"], { uid: true });
  });
}

export async function deleteEmail(
  account: AccountWithPassword,
  folderId: MailFolderId,
  uid: number
): Promise<void> {
  await withMailbox(account, folderId, async (client) => {
    await client.messageDelete(uid, { uid: true });
  });
}

export async function appendToSentFolder(
  account: AccountWithPassword,
  rawMessage: Buffer | string
): Promise<void> {
  await withImapSlot(async () => {
    const client = await connectAccount(account);
    try {
      const sentPath = await resolveMailbox(client, "sent", account.email);
      if (!sentPath) {
        throw new Error("Папка «Отправленные» не найдена на сервере");
      }

      const appended = await client.append(sentPath, rawMessage, ["\\Seen"], new Date());
      if (!appended) {
        throw new Error("Не удалось сохранить письмо в отправленные");
      }
    } finally {
      await safeLogout(client);
    }
  });
}

export async function clearMailbox(
  account: AccountWithPassword,
  folderId: MailFolderId
): Promise<number> {
  return withMailbox(account, folderId, async (client) => {
    const uids = await client.search({ all: true }, { uid: true });
    if (!uids || uids.length === 0) return 0;
    await client.messageDelete(uids, { uid: true });
    return uids.length;
  });
}

export async function moveEmail(
  account: AccountWithPassword,
  fromFolderId: MailFolderId,
  toFolderId: MailFolderId,
  uid: number
): Promise<void> {
  await withImapSlot(async () => {
    const client = await connectAccount(account);
    try {
      const fromPath = await resolveMailbox(client, fromFolderId, account.email);
      const toPath = await resolveMailbox(client, toFolderId, account.email);
      if (!fromPath) {
        throw new Error(`Исходная папка «${fromFolderId}» не найдена`);
      }
      if (!toPath) {
        throw new Error(`Папка назначения «${toFolderId}» не найдена на сервере`);
      }

      const lock = await client.getMailboxLock(fromPath);
      try {
        const moved = await client.messageMove(uid, toPath, { uid: true });
        if (!moved) {
          throw new Error("Не удалось переместить письмо");
        }
      } finally {
        lock.release();
      }
    } finally {
      await safeLogout(client);
    }
  });
}

export async function getFolderUnreadCount(
  account: AccountWithPassword,
  folderId: MailFolderId
): Promise<number> {
  const counts = await getAllFolderUnreadCounts(account);
  return counts[folderId] ?? 0;
}

export async function getAllFolderUnreadCounts(
  account: AccountWithPassword
): Promise<Record<MailFolderId, number>> {
  return withImapSlot(async () => {
    const counts: Record<MailFolderId, number> = { ...EMPTY_UNREAD_COUNTS };
    const client = await connectAccount(account);
    try {
      for (const folder of MAIL_FOLDERS) {
        try {
          const path = await resolveMailbox(client, folder.id, account.email);
          if (!path) continue;
          const status = await client.status(path, { unseen: true });
          counts[folder.id] = status.unseen ?? 0;
        } catch {
          counts[folder.id] = 0;
        }
      }
      return counts;
    } finally {
      await safeLogout(client);
    }
  });
}

/** @deprecated use fetchMailbox */
export async function fetchInbox(
  account: AccountWithPassword,
  limit = 50
): Promise<EmailSummary[]> {
  const page = await fetchMailbox(account, "inbox", limit);
  return page.emails;
}

function mergeParsedAttachments(
  parsed: {
    filename?: string;
    contentType?: string;
    size?: number;
    contentDisposition?: string;
    contentId?: string;
    related?: boolean;
  }[],
  structure?: BodyStructureNode
): EmailAttachment[] {
  const structureParts = collectAttachmentsFromStructure(structure);
  const structureByName = new Map(
    structureParts.map((part) => [normalizeFilename(part.filename), part])
  );

  const result: EmailAttachment[] = [];
  let index = 0;

  for (const item of parsed) {
    if (!shouldIncludeParsedAttachment(item)) continue;

    const filename = item.filename?.trim();
    const name = filename || `attachment-${++index}`;
    const fromStructure =
      structureByName.get(normalizeFilename(name)) ||
      (filename
        ? findStructurePartByFilename(structure, filename)
        : undefined);
    const partId = fromStructure?.partId;

    if (!partId) continue;

    result.push({
      partId,
      filename: name,
      contentType: item.contentType || fromStructure?.contentType || "application/octet-stream",
      size: item.size ?? fromStructure?.size,
    });
  }

  return result.length > 0 ? result : structureParts;
}

async function readPartBuffer(
  client: ImapFlow,
  uid: number,
  partId: string
): Promise<{ content: Buffer; filename?: string; contentType?: string } | null> {
  try {
    const downloaded = await client.downloadMany(uid, [partId], { uid: true });
    if (downloaded) {
      const entry = downloaded[partId];
      if (entry?.content?.length) {
        return {
          content: Buffer.isBuffer(entry.content)
            ? entry.content
            : Buffer.from(entry.content),
          filename: entry.meta?.filename,
          contentType: entry.meta?.contentType,
        };
      }
    }
  } catch {
    /* try stream download */
  }

  try {
    const streamDownload = await client.download(uid, partId, { uid: true });
    if (!streamDownload?.content) return null;

    const chunks: Buffer[] = [];
    for await (const chunk of streamDownload.content) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const content = Buffer.concat(chunks);
    if (!content.length) return null;

    return {
      content,
      filename: streamDownload.meta?.filename,
      contentType: streamDownload.meta?.contentType,
    };
  } catch {
    return null;
  }
}

async function downloadFromParsedMessage(
  client: ImapFlow,
  uid: number,
  filenameHint?: string
): Promise<{ content: Buffer; filename: string; contentType: string } | null> {
  const full = await client.fetchOne(uid, { source: true }, { uid: true });
  if (!full || !full.source) return null;

  const parsed = await simpleParser(full.source);
  if (!parsed.attachments?.length) return null;

  const normHint = filenameHint ? normalizeFilename(filenameHint) : "";

  const candidates = parsed.attachments.filter(shouldIncludeParsedAttachment);

  if (!candidates.length) return null;

  let match =
    normHint &&
    candidates.find(
      (att) => normalizeFilename(att.filename || "") === normHint
    );

  if (!match) {
    match =
      candidates.find(
        (att) => (att.contentDisposition || "").toLowerCase() === "attachment"
      ) || candidates[0];
  }

  if (!match?.content) return null;

  const content = Buffer.isBuffer(match.content)
    ? match.content
    : Buffer.from(match.content);

  if (!content.length) return null;

  return {
    content,
    filename: match.filename || filenameHint || "attachment",
    contentType: match.contentType || "application/octet-stream",
  };
}

function resolveAttachmentPart(
  attachments: EmailAttachment[],
  part: string,
  filenameHint?: string
): EmailAttachment | undefined {
  if (filenameHint) {
    const normHint = normalizeFilename(filenameHint);
    const byName = attachments.find(
      (item) => normalizeFilename(item.filename) === normHint
    );
    if (byName) return byName;
  }

  const byPart = attachments.find((item) => item.partId === part);
  if (byPart) return byPart;

  return attachments[0];
}

export async function downloadAttachment(
  account: AccountWithPassword,
  folderId: MailFolderId,
  uid: number,
  part: string,
  filenameHint?: string
): Promise<{ content: Buffer; filename: string; contentType: string } | null> {
  return withMailbox(account, folderId, async (client) => {
    const structureMessage = await client.fetchOne(
      uid,
      { bodyStructure: true },
      { uid: true }
    );

    if (structureMessage) {
      const attachments = collectAttachmentsFromStructure(
        structureMessage.bodyStructure as BodyStructureNode | undefined
      );

      const seenParts = new Set<string>();
      const candidates: EmailAttachment[] = [];

      const primary = resolveAttachmentPart(attachments, part, filenameHint);
      if (primary) candidates.push(primary);

      for (const item of attachments) {
        if (!seenParts.has(item.partId)) {
          candidates.push(item);
          seenParts.add(item.partId);
        }
      }

      if (part && !seenParts.has(part)) {
        candidates.unshift({
          partId: part,
          filename: filenameHint || "attachment",
          contentType: "application/octet-stream",
        });
      }

      for (const candidate of candidates) {
        const file = await readPartBuffer(client, uid, candidate.partId);
        if (!file?.content?.length) continue;

        return {
          content: file.content,
          filename:
            file.filename || candidate.filename || filenameHint || "attachment",
          contentType:
            file.contentType ||
            candidate.contentType ||
            "application/octet-stream",
        };
      }
    }

    return downloadFromParsedMessage(client, uid, filenameHint);
  });
}
