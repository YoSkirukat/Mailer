import { ImapFlow, type SearchObject } from "imapflow";
import { simpleParser } from "mailparser";
import type { AccountWithPassword } from "./db";
import {
  type MailFolderId,
  resolveMailbox,
  SEARCHABLE_FOLDERS,
} from "./folders";
import {
  collectAttachmentsFromStructure,
  hasAttachmentsInStructure,
  normalizeFilename,
  type BodyStructureNode,
} from "./attachments";
import { isImapSecure, tlsOptions } from "./mail-config";
import type { EmailDetail, EmailSummary, EmailAttachment } from "./types";

function createImapClient(account: AccountWithPassword) {
  const tls = tlsOptions(account.ignoreTlsErrors);
  return new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: isImapSecure(account.imapPort),
    auth: { user: account.email, pass: account.password },
    logger: false,
    ...(tls ? { tls } : {}),
  });
}

async function withMailbox<T>(
  account: AccountWithPassword,
  folderId: MailFolderId,
  fn: (client: ImapFlow) => Promise<T>
): Promise<T> {
  const client = createImapClient(account);
  await client.connect();
  try {
    const mailbox = await resolveMailbox(client, folderId);
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
    await client.logout();
  }
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

async function buildSummaryFromMessage(
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
  }
): Promise<EmailSummary> {
  let snippet = "";
  if (message.source) {
    try {
      const parsed = await simpleParser(message.source);
      snippet = (parsed.text || parsed.html || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160);
    } catch {
      snippet = "";
    }
  }

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
    snippet,
    folder: folderId,
  };
}

export async function fetchSummariesByUids(
  account: AccountWithPassword,
  folderId: MailFolderId,
  uids: number[]
): Promise<EmailSummary[]> {
  if (uids.length === 0) return [];

  return withMailbox(account, folderId, async (client) => {
    const emails: EmailSummary[] = [];
    const range = uids.join(",");

    for await (const message of client.fetch(range, {
      uid: true,
      envelope: true,
      flags: true,
      bodyStructure: true,
      source: { start: 0, maxLength: 2048 },
    }, { uid: true })) {
      emails.push(await buildSummaryFromMessage(account, folderId, message));
    }

    return emails;
  });
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

export async function fetchMailbox(
  account: AccountWithPassword,
  folderId: MailFolderId,
  limit = 50
): Promise<EmailSummary[]> {
  return withMailbox(account, folderId, async (client) => {
    const total = client.mailbox?.exists ?? 0;
    if (total === 0) return [];

    const start = Math.max(1, total - limit + 1);
    const range = `${start}:${total}`;
    const emails: EmailSummary[] = [];

    for await (const message of client.fetch(range, {
      uid: true,
      envelope: true,
      flags: true,
      bodyStructure: true,
      source: { start: 0, maxLength: 2048 },
    })) {
      emails.push(await buildSummaryFromMessage(account, folderId, message));
    }

    return emails.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
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
  const total = client.mailbox?.exists ?? 0;
  if (total === 0) return [];

  const scanSize = Math.min(total, 500);
  const start = Math.max(1, total - scanSize + 1);
  const emails: EmailSummary[] = [];

  for await (const message of client.fetch(`${start}:${total}`, {
    uid: true,
    envelope: true,
    flags: true,
    bodyStructure: true,
    source: { start: 0, maxLength: 2048 },
  })) {
    if (message.flags?.has("\\Seen")) continue;
    emails.push(await buildSummaryFromMessage(account, folderId, message));
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
      const path = client.mailbox?.path;
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
    const emails: EmailSummary[] = [];
    const range = targetUids.join(",");

    for await (const message of client.fetch(
      range,
      {
        uid: true,
        envelope: true,
        flags: true,
        bodyStructure: true,
        source: { start: 0, maxLength: 2048 },
      },
      { uid: true }
    )) {
      emails.push(await buildSummaryFromMessage(account, folderId, message));
    }

    return emails.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  });
}

const SEARCH_RESULT_LIMIT = 100;

function buildSearchQuery(query: string): SearchObject {
  return {
    or: [
      { from: query },
      { to: query },
      { subject: query },
      { text: query },
    ],
  };
}

async function searchUids(client: ImapFlow, query: string): Promise<number[]> {
  const q = query.trim();
  if (!q) return [];

  let uids: number[] | false = false;
  try {
    uids = await client.search(buildSearchQuery(q), { uid: true });
  } catch {
    try {
      uids = await client.search({ text: q }, { uid: true });
    } catch {
      return [];
    }
  }

  return uids || [];
}

export async function searchMailboxUids(
  account: AccountWithPassword,
  folderId: MailFolderId,
  query: string
): Promise<number[]> {
  const q = query.trim();
  if (!q) return [];

  return withMailbox(account, folderId, async (client) => searchUids(client, q));
}

export async function searchMailbox(
  account: AccountWithPassword,
  folderId: MailFolderId,
  query: string,
  limit = SEARCH_RESULT_LIMIT
): Promise<EmailSummary[]> {
  const q = query.trim();
  if (!q) return fetchMailbox(account, folderId, limit);

  return withMailbox(account, folderId, async (client) => {
    const uids = await searchUids(client, q);
    if (uids.length === 0) return [];

    const targetUids =
      uids.length > limit ? uids.slice(uids.length - limit) : uids;
    const emails: EmailSummary[] = [];
    const range = targetUids.join(",");

    for await (const message of client.fetch(
      range,
      {
        uid: true,
        envelope: true,
        flags: true,
        bodyStructure: true,
        source: { start: 0, maxLength: 2048 },
      },
      { uid: true }
    )) {
      emails.push(await buildSummaryFromMessage(account, folderId, message));
    }

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

  const perFolder = Math.max(
    15,
    Math.ceil(limit / SEARCHABLE_FOLDERS.length)
  );

  const batches = await Promise.allSettled(
    SEARCHABLE_FOLDERS.map((folderId) =>
      searchMailbox(account, folderId, q, perFolder)
    )
  );

  const emails: EmailSummary[] = [];
  for (const result of batches) {
    if (result.status === "fulfilled") {
      emails.push(...result.value);
    }
  }

  return emails
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
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
  const fromStr = isSent
    ? formatAddressList(message.envelope?.to) || "Неизвестный"
    : formatAddress(message.envelope?.from?.[0]);

  const toList = formatAddressList(message.envelope?.to);

  let attachments = collectAttachmentsFromStructure(
    message.bodyStructure as BodyStructureNode | undefined
  );

  if (attachments.length === 0 && parsed.attachments?.length) {
    attachments = mergeParsedAttachments(
      parsed.attachments,
      message.bodyStructure as BodyStructureNode | undefined
    );
  }

  return {
    uid: message.uid,
    accountId: account.id,
    accountEmail: account.email,
    accountName: account.name,
    accountColor: account.color,
    subject: message.envelope?.subject || "(без темы)",
    from: isSent ? fromStr : formatAddress(message.envelope?.from?.[0]),
    to: toList,
    date: message.envelope?.date?.toISOString() || new Date().toISOString(),
    seen,
    answered: message.flags?.has("\\Answered") ?? false,
    hasAttachments: attachments.length > 0,
    attachments,
    snippet: (parsed.text || "").slice(0, 160),
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
  });
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
  });
}

export async function testImapConnection(
  account: AccountWithPassword
): Promise<void> {
  const client = createImapClient(account);
  await client.connect();
  await client.logout();
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

export async function moveEmail(
  account: AccountWithPassword,
  fromFolderId: MailFolderId,
  toFolderId: MailFolderId,
  uid: number
): Promise<void> {
  const client = createImapClient(account);
  await client.connect();
  try {
    const fromPath = await resolveMailbox(client, fromFolderId);
    const toPath = await resolveMailbox(client, toFolderId);
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
    await client.logout();
  }
}

export async function getFolderUnreadCount(
  account: AccountWithPassword,
  folderId: MailFolderId
): Promise<number> {
  const client = createImapClient(account);
  await client.connect();
  try {
    const path = await resolveMailbox(client, folderId);
    if (!path) return 0;
    const status = await client.status(path, { unseen: true });
    return status.unseen ?? 0;
  } catch {
    return 0;
  } finally {
    await client.logout();
  }
}

/** @deprecated use fetchMailbox */
export async function fetchInbox(
  account: AccountWithPassword,
  limit = 50
): Promise<EmailSummary[]> {
  return fetchMailbox(account, "inbox", limit);
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
  const unusedStructure = [...structureParts];

  const result: EmailAttachment[] = [];
  let index = 0;

  for (const item of parsed) {
    const filename = item.filename?.trim();
    const disp = (item.contentDisposition || "").toLowerCase();
    const isInlineImage =
      disp === "inline" && Boolean(item.contentId) && !filename;

    if (isInlineImage || item.related) continue;
    if (!filename && disp !== "attachment") continue;

    const name = filename || `attachment-${++index}`;
    const fromStructure = structureByName.get(normalizeFilename(name));
    const fromOrder = unusedStructure.shift();
    const partId = fromStructure?.partId || fromOrder?.partId;

    if (!partId) continue;

    result.push({
      partId,
      filename: name,
      contentType: item.contentType || fromStructure?.contentType || "application/octet-stream",
      size: item.size ?? fromStructure?.size ?? fromOrder?.size,
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
    if (downloaded && !("response" in downloaded && downloaded.response === false)) {
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

  const candidates = parsed.attachments.filter((att) => {
    if (att.related) return false;
    const disp = (att.contentDisposition || "").toLowerCase();
    if (disp === "inline" && att.contentId && !att.filename) return false;
    return Boolean(att.filename) || disp === "attachment";
  });

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
