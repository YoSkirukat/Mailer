import { NextResponse } from "next/server";
import { getAccountWithPassword } from "@/lib/db";
import { isValidFolderId } from "@/lib/folders";
import { downloadAttachment } from "@/lib/imap";
import { isPreviewableAttachment } from "@/lib/attachments";

function contentDispositionFilename(filename: string, inline: boolean): string {
  const asciiFallback =
    filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "") || "attachment";
  const encoded = encodeURIComponent(filename);
  const mode = inline ? "inline" : "attachment";
  return `${mode}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const uid = searchParams.get("uid");
    const part = searchParams.get("part");
    const filename = searchParams.get("filename");
    const inlineParam = searchParams.get("inline");
    const folderParam = searchParams.get("folder") || "inbox";
    const folder = isValidFolderId(folderParam) ? folderParam : "inbox";

    if (!accountId || !uid || !part) {
      return NextResponse.json(
        { error: "Не указаны параметры вложения" },
        { status: 400 }
      );
    }

    const account = getAccountWithPassword(accountId);
    if (!account) {
      return NextResponse.json({ error: "Аккаунт не найден" }, { status: 404 });
    }

    const file = await downloadAttachment(
      account,
      folder,
      Number(uid),
      part,
      filename || undefined
    );

    if (!file) {
      return NextResponse.json({ error: "Вложение не найдено" }, { status: 404 });
    }

    const inline =
      inlineParam === "1"
        ? true
        : inlineParam === "0"
          ? false
          : isPreviewableAttachment(file.contentType, file.filename);

    return new NextResponse(new Uint8Array(file.content), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": contentDispositionFilename(file.filename, inline),
        "Content-Length": String(file.content.length),
      },
    });
  } catch (error) {
    console.error("[attachments]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка загрузки" },
      { status: 500 }
    );
  }
}
