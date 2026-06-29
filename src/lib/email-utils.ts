/** Извлекает email из строки вида "Имя <user@mail.ru>" */
export function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].trim();
  if (from.includes("@")) return from.trim();
  return from;
}

const FORWARD_BODY_MARKER =
  /(?:----------\s*Пересланное сообщение|----------\s*Forwarded message|--------\s*Пересланное письмо|Begin forwarded message)/i;

const FORWARD_FROM_LINE =
  /(?:^|[\n\r])\s*(?:>|&gt;)?\s*(?:От|From)\s*:\s*(.+?)(?:\r?\n|$)/gi;

/** Ищет адрес исходного отправителя в теле пересланного письма */
export function parseForwardedOriginalSender(
  content: string,
  ownAddresses: Set<string> = new Set()
): string | null {
  const text = content.trim();
  if (!text) return null;

  const markerMatch = FORWARD_BODY_MARKER.exec(text);
  const searchText = markerMatch ? text.slice(markerMatch.index) : text;

  const matches: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(FORWARD_FROM_LINE.source, FORWARD_FROM_LINE.flags);
  while ((match = re.exec(searchText)) !== null) {
    matches.push(match[1].trim());
  }

  for (const line of matches) {
    const addr = extractEmailAddress(line);
    if (!addr.includes("@")) continue;
    if (ownAddresses.has(addr.toLowerCase())) continue;
    return line;
  }

  return null;
}

/** Адрес для ответа: учитывает пересылку и заголовки Reply-To / Original-From */
export function resolveReplyRecipient(
  email: {
    from: string;
    to: string;
    folder?: string;
    replyToHeader?: string;
    originalFromHeader?: string;
    text?: string;
    html?: string;
  },
  options?: { ownAddresses?: string[] }
): string {
  if (email.folder === "sent") {
    const firstTo = email.to.split(",")[0]?.trim();
    return extractEmailAddress(firstTo || email.to);
  }

  const own = new Set(
    (options?.ownAddresses ?? [])
      .map((address) => extractEmailAddress(address).toLowerCase())
      .filter(Boolean)
  );
  const fromEmail = extractEmailAddress(email.from).toLowerCase();
  const looksForwarded =
    own.has(fromEmail) ||
    Boolean(email.originalFromHeader) ||
    Boolean(email.replyToHeader);

  const bodyText = [email.text, email.html?.replace(/<[^>]+>/g, " ")]
    .filter(Boolean)
    .join("\n");
  const bodyFrom = parseForwardedOriginalSender(bodyText, own);

  const candidates = [
    email.replyToHeader,
    email.originalFromHeader,
    bodyFrom,
    email.from,
  ].filter((value): value is string => Boolean(value?.trim()));

  for (const candidate of candidates) {
    const addr = extractEmailAddress(candidate);
    if (!addr.includes("@")) continue;
    if (looksForwarded && own.has(addr.toLowerCase())) continue;
    return addr;
  }

  return extractEmailAddress(email.from);
}

/** Разбирает строку адреса на имя и email */
export function parseEmailAddress(value: string): {
  name: string;
  email: string;
} {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    const name = match[1].trim().replace(/^["']|["']$/g, "");
    return { name: name || match[2].trim(), email: match[2].trim() };
  }
  if (trimmed.includes("@")) {
    const email = trimmed;
    return { name: email.split("@")[0], email };
  }
  return { name: trimmed, email: trimmed };
}

/** Имя отправителя/получателя без email — для списка писем */
export function formatPeerDisplayName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed
    .split(/,\s*/)
    .map((part) => parseEmailAddress(part).name)
    .join(", ");
}

export function replySubject(subject: string): string {
  if (/^re:\s/i.test(subject)) return subject;
  return `Re: ${subject}`;
}

export function forwardSubject(subject: string): string {
  if (/^fwd?:\s/i.test(subject)) return subject;
  return `Fwd: ${subject}`;
}

export function buildReplyQuote(email: {
  from: string;
  date: string;
  text?: string;
}): string {
  const body = email.text || "";
  const quoted = body
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const date = new Date(email.date).toLocaleString("ru-RU");
  return `\n\n---\n${date}, ${email.from}:\n${quoted}`;
}

export function buildForwardBody(email: {
  from: string;
  to: string;
  date: string;
  subject: string;
  text?: string;
}): string {
  const date = new Date(email.date).toLocaleString("ru-RU");
  return `\n\n---------- Пересланное сообщение ----------\nОт: ${email.from}\nКому: ${email.to}\nДата: ${date}\nТема: ${email.subject}\n\n${email.text || ""}`;
}

const COMPOSE_QUOTE_MARKERS = [
  "\n\n---\n",
  "\n\n---------- Пересланное сообщение ----------\n",
];

export function splitComposeText(text: string): { body: string; quote: string } {
  for (const marker of COMPOSE_QUOTE_MARKERS) {
    const index = text.indexOf(marker);
    if (index !== -1) {
      return { body: text.slice(0, index), quote: text.slice(index) };
    }
  }
  return { body: text, quote: "" };
}

/** Текст нового письма или ответа: подпись перед цитатой */
export function buildComposeText(
  signature?: string,
  quoteBlock = ""
): string {
  const sig = signature?.trim();
  if (!sig) return quoteBlock;
  if (!quoteBlock) return `\n\n${sig}`;
  return `\n\n${sig}${quoteBlock}`;
}

export function replaceComposeSignature(
  text: string,
  newSignature: string | undefined,
  oldSignature?: string | undefined
): string {
  const { body, quote } = splitComposeText(text);
  let userBody = body.trimEnd();
  const oldSig = oldSignature?.trim();

  if (oldSig) {
    if (userBody.endsWith(`\n\n${oldSig}`)) {
      userBody = userBody.slice(0, -(oldSig.length + 2)).trimEnd();
    } else if (userBody === oldSig || userBody.endsWith(oldSig)) {
      userBody = userBody.slice(0, userBody.lastIndexOf(oldSig)).trimEnd();
    }
  }

  const sig = newSignature?.trim();
  if (!sig) {
    if (userBody) return quote ? `${userBody}${quote}` : userBody;
    return quote;
  }

  const middle = userBody ? `${userBody}\n\n${sig}` : `\n\n${sig}`;
  return quote ? `${middle}${quote}` : middle;
}
