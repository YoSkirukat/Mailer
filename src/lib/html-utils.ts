export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function plainTextToHtml(text: string): string {
  if (!text.trim()) return "<p><br></p>";
  return text
    .split(/\n/)
    .map((line) => `<p>${line ? escapeHtml(line) : "<br>"}</p>`)
    .join("");
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isHtmlEmpty(html: string): boolean {
  return htmlToPlainText(html).length === 0;
}

export const EMPTY_EDITOR_HTML = "<p><br></p>";

export function richTextToEditorHtml(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return EMPTY_EDITOR_HTML;
  if (!/<[a-z][\s\S]*>/i.test(trimmed)) {
    return plainTextToHtml(trimmed);
  }
  return trimmed;
}

function signatureToHtml(signature?: string): string {
  const sig = signature?.trim();
  if (!sig) return "";
  if (/<[a-z][\s\S]*>/i.test(sig)) {
    return sig;
  }
  return plainTextToHtml(sig);
}

function removeTrailingSignatureHtml(body: string, sigHtml: string): string {
  const sig = sigHtml.trim();
  if (!sig) return body;
  const trimmedBody = body.trimEnd();
  if (trimmedBody.endsWith(sig)) {
    return trimmedBody.slice(0, -sig.length).trimEnd();
  }
  return body;
}

export function splitComposeHtml(html: string): { body: string; quote: string } {
  const hrIndex = html.search(/<hr\b/i);
  if (hrIndex !== -1) {
    return { body: html.slice(0, hrIndex), quote: html.slice(hrIndex) };
  }
  return { body: html, quote: "" };
}

export function replaceComposeSignatureHtml(
  html: string,
  newSignature: string | undefined,
  oldSignature?: string | undefined
): string {
  const { body, quote } = splitComposeHtml(html);
  const oldSigHtml = signatureToHtml(oldSignature);
  const newSigHtml = signatureToHtml(newSignature);

  let userBody = oldSigHtml ? removeTrailingSignatureHtml(body, oldSigHtml) : body;
  userBody = userBody.trimEnd();
  if (!userBody || isHtmlEmpty(userBody)) {
    userBody = EMPTY_EDITOR_HTML;
  }

  const parts = [userBody];
  if (newSigHtml) parts.push(newSigHtml);
  if (quote) parts.push(quote);
  return parts.join("");
}

export function buildComposeHtml(
  signature?: string,
  quoteHtml = ""
): string {
  const sigHtml = signatureToHtml(signature);
  const parts: string[] = ["<p><br></p>"];
  if (sigHtml) {
    parts.push(sigHtml);
  }
  if (quoteHtml) {
    parts.push(quoteHtml);
  }
  return parts.join("");
}

export function buildReplyQuoteHtml(email: {
  from: string;
  date: string;
  text?: string;
  html?: string;
}): string {
  const date = new Date(email.date).toLocaleString("ru-RU");
  const bodyHtml =
    email.html?.trim() || plainTextToHtml(email.text || "");
  return `<hr><p style="color:#6b7280;font-size:0.9em">${escapeHtml(date)}, ${escapeHtml(email.from)}:</p><blockquote>${bodyHtml}</blockquote>`;
}

export function buildForwardHtml(email: {
  from: string;
  to: string;
  date: string;
  subject: string;
  text?: string;
  html?: string;
}): string {
  const date = new Date(email.date).toLocaleString("ru-RU");
  const bodyHtml = email.html?.trim() || plainTextToHtml(email.text || "");
  return `<hr><p><strong>---------- Пересланное сообщение ----------</strong></p><p>От: ${escapeHtml(email.from)}<br>Кому: ${escapeHtml(email.to)}<br>Дата: ${escapeHtml(date)}<br>Тема: ${escapeHtml(email.subject)}</p>${bodyHtml}`;
}
