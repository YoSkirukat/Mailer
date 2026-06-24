/** Извлекает email из строки вида "Имя <user@mail.ru>" */
export function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].trim();
  if (from.includes("@")) return from.trim();
  return from;
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
