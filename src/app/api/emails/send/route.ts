import { NextResponse } from "next/server";
import { getAccountWithPassword } from "@/lib/db";
import { embedHtmlImages } from "@/lib/embed-html-images";
import { isValidFolderId } from "@/lib/folders";import { htmlToPlainText, isHtmlEmpty } from "@/lib/html-utils";
import { setEmailAnswered } from "@/lib/imap";
import { sendMail } from "@/lib/smtp";

interface SendAttachmentPayload {
  filename: string;
  contentType?: string;
  content: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      accountId,
      to,
      cc,
      bcc,
      subject,
      text,
      html,
      attachments,
      replyTo,
    } = body as {
      accountId?: string;
      to?: string;
      cc?: string;
      bcc?: string;
      subject?: string;
      text?: string;
      html?: string;
      attachments?: SendAttachmentPayload[];
      replyTo?: {
        accountId?: string;
        uid?: number;
        folder?: string;
      };
    };

    const htmlBody = typeof html === "string" ? html : "";
    const plainBody =
      typeof text === "string" && text.trim()
        ? text.trim()
        : htmlToPlainText(htmlBody);

    if (
      !accountId ||
      !to?.trim() ||
      !subject?.trim() ||
      (!plainBody && isHtmlEmpty(htmlBody))
    ) {
      return NextResponse.json(
        { error: "Заполните все поля письма" },
        { status: 400 }
      );
    }

    const account = getAccountWithPassword(accountId);
    if (!account) {
      return NextResponse.json({ error: "Аккаунт не найден" }, { status: 404 });
    }

    const mailAttachments = Array.isArray(attachments)
      ? attachments
          .filter((item) => item?.filename && item?.content)
          .map((item) => ({
            filename: item.filename,
            contentType: item.contentType || "application/octet-stream",
            content: Buffer.from(item.content, "base64"),
          }))
      : [];

    const trimmedHtml = htmlBody.trim();
    const { html: sendHtml, inlineImages } = trimmedHtml
      ? embedHtmlImages(trimmedHtml)
      : { html: "", inlineImages: [] };

    const allAttachments = [
      ...mailAttachments,
      ...inlineImages.map((image) => ({
        filename: image.filename,
        contentType: image.contentType,
        content: image.content,
        cid: image.cid,
      })),
    ];

    await sendMail(account, {
      to: to.trim(),
      cc: cc?.trim() || undefined,
      bcc: bcc?.trim() || undefined,
      subject: subject.trim(),
      text: plainBody,
      html: sendHtml || undefined,
      attachments: allAttachments.length > 0 ? allAttachments : undefined,
    });
    if (
      replyTo?.accountId &&
      replyTo?.uid &&
      replyTo?.folder &&
      isValidFolderId(replyTo.folder)
    ) {
      const sourceAccount = getAccountWithPassword(replyTo.accountId);
      if (sourceAccount) {
        void setEmailAnswered(
          sourceAccount,
          replyTo.folder,
          Number(replyTo.uid)
        ).catch(() => {
          /* ответ отправлен, флаг на сервере необязателен */
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось отправить" },
      { status: 400 }
    );
  }
}
