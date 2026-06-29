import { randomUUID } from "crypto";

const DATA_URI_PATTERN =
  /src=["'](data:image\/([^;]+);base64,([^"']+))["']/gi;

export interface InlineHtmlImageAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
  cid: string;
}

function imageExtension(mimeSub: string): string {
  if (mimeSub === "jpeg") return "jpg";
  if (mimeSub === "svg+xml") return "svg";
  return mimeSub.replace(/[^a-z0-9+.-]/gi, "") || "img";
}

export function embedHtmlImages(html: string): {
  html: string;
  inlineImages: InlineHtmlImageAttachment[];
} {
  const inlineImages: InlineHtmlImageAttachment[] = [];
  let index = 0;

  const processed = html.replace(
    DATA_URI_PATTERN,
    (_match, _full, mimeSub, base64) => {
      index += 1;
      const contentType = `image/${mimeSub}`;
      const cid = `img${index}.${randomUUID().slice(0, 8)}@mailer`;
      inlineImages.push({
        filename: `image-${index}.${imageExtension(mimeSub)}`,
        content: Buffer.from(base64, "base64"),
        contentType,
        cid,
      });
      return `src="cid:${cid}"`;
    }
  );

  return { html: processed, inlineImages };
}
