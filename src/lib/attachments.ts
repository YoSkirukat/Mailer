export interface BodyStructureNode {
  part?: string;
  type?: string;
  disposition?: string;
  parameters?: Record<string, string>;
  dispositionParameters?: Record<string, string>;
  size?: number;
  childNodes?: BodyStructureNode[];
}

export interface EmailAttachment {
  partId: string;
  filename: string;
  contentType: string;
  size?: number;
}

function decodeRfc2231(value: string): string {
  const match = value.match(/^([^']*)'[^']*'(.*)$/);
  if (!match) return value;
  try {
    return decodeURIComponent(match[2]);
  } catch {
    return value;
  }
}

function decodeFilename(value: string): string {
  const rfc2231 = decodeRfc2231(value);
  if (rfc2231 !== value) return rfc2231;

  const rfc2047 = value.match(/^=\?([^?]+)\?([BQbq])\?([^?]*)\?=$/);
  if (rfc2047) {
    try {
      if (rfc2047[2].toUpperCase() === "B") {
        return Buffer.from(rfc2047[3], "base64").toString("utf-8");
      }
    } catch {
      /* keep original */
    }
  }
  return value;
}

export function getPartFilename(node: BodyStructureNode): string | undefined {
  const raw =
    node.dispositionParameters?.filename ||
    node.dispositionParameters?.["filename*"] ||
    node.parameters?.name ||
    node.parameters?.filename;

  if (!raw) return undefined;
  return decodeFilename(raw);
}

export function isSignatureInlineFilename(filename: string): boolean {
  const name = filename.trim().toLowerCase();
  if (!name) return false;

  return (
    /^mailrusigimg[_-]?/i.test(name) ||
    /^yandex[_-]?sig/i.test(name) ||
    /^signature[._-]/i.test(name) ||
    /^sig[._-]?(img|image)/i.test(name) ||
    /mail[_-]?ru[_-]?sig/i.test(name)
  );
}

export function shouldIncludeParsedAttachment(item: {
  filename?: string;
  contentType?: string;
  contentDisposition?: string;
  contentId?: string;
  related?: boolean;
}): boolean {
  if (item.related) return false;

  const disp = (item.contentDisposition || "").toLowerCase();
  const contentType = (item.contentType || "").toLowerCase();
  const filename = item.filename?.trim() || "";

  if (filename && isSignatureInlineFilename(filename)) return false;

  if (disp === "attachment") return true;

  if (disp === "inline" && contentType.startsWith("image/")) {
    if (isSignatureInlineFilename(filename)) return false;
    if (item.contentId && !filename) return false;
    return false;
  }

  if (!filename && disp !== "attachment") return false;

  return Boolean(filename);
}

function isEmbeddedInlinePart(node: BodyStructureNode): boolean {
  const type = (node.type || "").toLowerCase();
  const disp = (node.disposition || "").toLowerCase();
  const filename = getPartFilename(node) || "";

  if (isSignatureInlineFilename(filename)) return true;
  if (type.startsWith("image/") && disp === "inline") return true;

  return false;
}

export function isAttachmentPart(node: BodyStructureNode): boolean {
  const type = (node.type || "").toLowerCase();
  const disp = (node.disposition || "").toLowerCase();
  const filename = getPartFilename(node);

  if (type.startsWith("multipart/")) return false;

  if (filename && isSignatureInlineFilename(filename)) return false;

  if (disp === "attachment") return true;

  if (type === "text/plain" || type === "text/html") return false;
  if (isEmbeddedInlinePart(node)) return false;

  if (filename) return true;

  if (type.startsWith("application/")) {
    const skip = [
      "application/pgp-signature",
      "application/pkcs7-signature",
      "application/x-pkcs7-signature",
    ];
    if (!skip.includes(type)) return true;
  }

  return false;
}

export function dedupeAttachments(parts: EmailAttachment[]): EmailAttachment[] {
  const seen = new Set<string>();
  const result: EmailAttachment[] = [];

  for (const part of parts) {
    const key = `${part.partId}:${normalizeFilename(part.filename)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(part);
  }

  return result;
}

export function hasAttachmentsInStructure(
  node?: BodyStructureNode | null
): boolean {
  return collectAttachmentsFromStructure(node).length > 0;
}

export function findStructurePartByFilename(
  node: BodyStructureNode | null | undefined,
  filename: string,
  path: number[] = []
): EmailAttachment | undefined {
  if (!node) return undefined;

  const type = (node.type || "").toLowerCase();
  if (type.startsWith("multipart/")) {
    let index = 0;
    for (const child of node.childNodes ?? []) {
      const found = findStructurePartByFilename(child, filename, [...path, ++index]);
      if (found) return found;
    }
    return undefined;
  }

  const partFilename = getPartFilename(node);
  if (
    partFilename &&
    normalizeFilename(partFilename) === normalizeFilename(filename)
  ) {
    const partId = node.part || (path.length > 0 ? path.join(".") : undefined);
    if (!partId) return undefined;
    return {
      partId,
      filename: partFilename,
      contentType: node.type || "application/octet-stream",
      size: node.size,
    };
  }

  return undefined;
}

export function collectAttachmentsFromStructure(
  node?: BodyStructureNode | null,
  acc: EmailAttachment[] = [],
  path: number[] = []
): EmailAttachment[] {
  if (!node) return acc;

  const type = (node.type || "").toLowerCase();
  if (type.startsWith("multipart/")) {
    let index = 0;
    for (const child of node.childNodes ?? []) {
      collectAttachmentsFromStructure(child, acc, [...path, ++index]);
    }
    return acc;
  }

  if (isAttachmentPart(node)) {
    const computedPart = path.length > 0 ? path.join(".") : undefined;
    const partId = node.part || computedPart;
    if (!partId) return acc;

    const filename = getPartFilename(node);
    acc.push({
      partId,
      filename: filename || guessFilename(node.type || "application/octet-stream"),
      contentType: node.type || "application/octet-stream",
      size: node.size,
    });
  }

  return acc;
}

function guessFilename(contentType: string): string {
  const map: Record<string, string> = {
    "application/pdf": "document.pdf",
    "application/zip": "archive.zip",
    "application/msword": "document.doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "document.docx",
    "application/vnd.ms-excel": "spreadsheet.xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      "spreadsheet.xlsx",
    "image/jpeg": "image.jpg",
    "image/png": "image.png",
    "image/gif": "image.gif",
  };
  return map[contentType.toLowerCase()] || "attachment";
}

export function formatAttachmentSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function normalizeFilename(name: string): string {
  try {
    return decodeURIComponent(name).normalize("NFC").trim().toLowerCase();
  } catch {
    return name.normalize("NFC").trim().toLowerCase();
  }
}

export function isPdfAttachment(
  contentType: string,
  filename: string
): boolean {
  return getPreviewKind(contentType, filename) === "pdf";
}

export type PreviewKind = "pdf" | "image" | "text";

export function getPreviewKind(
  contentType: string,
  filename: string
): PreviewKind | null {
  const type = contentType.toLowerCase();
  const name = normalizeFilename(filename);

  if (type.includes("pdf") || name.endsWith(".pdf")) return "pdf";

  if (
    type.startsWith("image/") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png")
  ) {
    return "image";
  }

  if (type.startsWith("text/plain") || name.endsWith(".txt")) return "text";

  return null;
}

export function isPreviewableAttachment(
  contentType: string,
  filename: string
): boolean {
  return getPreviewKind(contentType, filename) !== null;
}
