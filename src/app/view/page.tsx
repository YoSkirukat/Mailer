"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  formatAttachmentSize,
  getPreviewKind,
} from "@/lib/attachments";

function AttachmentViewContent() {
  const params = useSearchParams();

  const accountId = params.get("accountId");
  const uid = params.get("uid");
  const part = params.get("part");
  const folder = params.get("folder") || "inbox";
  const filename = params.get("filename") || "attachment";
  const contentType = params.get("contentType") || "";
  const size = params.get("size");

  if (!accountId || !uid || !part) {
    return (
      <div className="attachment-viewer-empty">
        Не указаны параметры вложения
      </div>
    );
  }

  const previewQuery = new URLSearchParams({
    accountId,
    uid,
    part,
    folder,
    filename,
    inline: "1",
  });

  const downloadQuery = new URLSearchParams({
    accountId,
    uid,
    part,
    folder,
    filename,
    inline: "0",
  });

  const previewSrc = `/api/emails/attachments?${previewQuery.toString()}`;
  const downloadHref = `/api/emails/attachments?${downloadQuery.toString()}`;
  const previewKind = getPreviewKind(contentType, filename) || "pdf";

  return (
    <div
      className={`attachment-viewer-page attachment-viewer-page--${previewKind}`}
    >
      <header className="attachment-viewer-header">
        <div className="attachment-viewer-title">
          <span className="attachment-viewer-filename">{filename}</span>
          {size ? (
            <span className="attachment-viewer-size">
              {formatAttachmentSize(Number(size))}
            </span>
          ) : null}
        </div>
        <a
          className="attachment-viewer-download"
          href={downloadHref}
          download={filename}
        >
          Скачать
        </a>
      </header>

      <div className="attachment-viewer-body">
        {previewKind === "image" ? (
          <img
            className="attachment-viewer-image"
            src={previewSrc}
            alt={filename}
          />
        ) : (
          <iframe
            className={`attachment-viewer-frame attachment-viewer-frame--${previewKind}`}
            src={previewSrc}
            title={filename}
          />
        )}
      </div>
    </div>
  );
}

export default function AttachmentViewPage() {
  return (
    <Suspense
      fallback={<div className="attachment-viewer-empty">Загрузка…</div>}
    >
      <AttachmentViewContent />
    </Suspense>
  );
}
