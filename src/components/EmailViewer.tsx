"use client";

import type { MailFolderId } from "@/lib/folders";
import { formatAttachmentSize, isPreviewableAttachment } from "@/lib/attachments";
import { FolderIcon } from "@/components/FolderIcon";
import { SenderAddressMenu } from "@/components/SenderAddressMenu";
import type { EmailDetail } from "@/lib/types";
export type EmailAction =
  | "reply"
  | "forward"
  | "delete"
  | "archive"
  | "markUnread"
  | "markRead";

interface EmailViewerProps {
  email: EmailDetail | null;
  loading: boolean;
  actionLoading?: boolean;
  folder: MailFolderId;
  onAction: (action: EmailAction) => void;
  onComposeTo?: (email: string) => void;
  onSearchFrom?: (email: string) => void;
}
const iconStroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function ReplyIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden>
      <polyline {...iconStroke} points="9 14 4 9 9 4" />
      <path {...iconStroke} d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

function ForwardIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden>
      <polyline {...iconStroke} points="15 14 20 9 15 4" />
      <path {...iconStroke} d="M4 20v-7a4 4 0 0 1 4-4h12" />
    </svg>
  );
}

function UnreadIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden>
      <circle {...iconStroke} cx="12" cy="12" r="5" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden>
      <path
        {...iconStroke}
        d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
      />
    </svg>
  );
}

function openAttachmentViewer(url: string, windowName: string) {
  const width = Math.min(1100, window.screen.availWidth - 80);
  const height = Math.min(820, window.screen.availHeight - 80);
  const left = Math.round((window.screen.availWidth - width) / 2);
  const top = Math.round((window.screen.availHeight - height) / 2);
  const features = [
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    "popup=yes",
    "menubar=no",
    "toolbar=no",
    "location=no",
    "status=no",
    "scrollbars=yes",
    "resizable=yes",
  ].join(",");

  const popup = window.open(url, windowName, features);
  popup?.focus();
}

export function EmailViewer({
  email,
  loading,
  actionLoading,
  folder,
  onAction,
  onComposeTo,
  onSearchFrom,
}: EmailViewerProps) {  if (loading) {
    return (
      <div className="email-viewer">
        <div className="empty">Загрузка письма…</div>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="email-viewer">
        <div className="empty">Выберите письмо для просмотра</div>
      </div>
    );
  }

  const emailFolder = (email.folder as MailFolderId) || folder;
  const inArchive = emailFolder === "archive";

  return (
    <div className="email-viewer">
      <div className="email-toolbar">
        <button
          type="button"
          className="toolbar-btn"
          onClick={() => onAction("delete")}
          disabled={actionLoading}
          title="Удалить"
        >
          <FolderIcon id="trash" size={18} />
          <span>Удалить</span>
        </button>
        <button
          type="button"
          className="toolbar-btn"
          onClick={() => onAction("archive")}
          disabled={actionLoading || inArchive}
          title="В архив"
        >
          <FolderIcon id="archive" size={18} />
          <span>В архив</span>
        </button>

        <span className="toolbar-spacer" />

        <button
          type="button"
          className="toolbar-btn"
          onClick={() => onAction("reply")}
          disabled={actionLoading}
          title="Ответить"
        >
          <ReplyIcon />
          <span>Ответить</span>
        </button>
        <button
          type="button"
          className="toolbar-btn"
          onClick={() => onAction("forward")}
          disabled={actionLoading}
          title="Переслать"
        >
          <ForwardIcon />
          <span>Переслать</span>
        </button>
        {email.seen ? (
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => onAction("markUnread")}
            disabled={actionLoading}
            title="Пометить непрочитанным"
          >
            <UnreadIcon />
            <span>Не прочитано</span>
          </button>
        ) : (
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => onAction("markRead")}
            disabled={actionLoading}
            title="Пометить прочитанным"
          >
            <UnreadIcon />
            <span>Прочитано</span>
          </button>
        )}
      </div>

      <div className="content">
        <div className="meta">
          <h2>{email.subject}</h2>
          <div className="meta-row">
            <strong>{folder === "sent" ? "Кому:" : "От:"}</strong>{" "}
            {folder === "sent" ? (
              email.to || email.from
            ) : onComposeTo && onSearchFrom ? (
              <SenderAddressMenu
                address={email.from}
                onCompose={onComposeTo}
                onSearch={onSearchFrom}
              />
            ) : (
              email.from
            )}
          </div>          {folder !== "sent" && (
            <div className="meta-row">
              <strong>Кому:</strong> {email.to}
            </div>
          )}
          {folder === "sent" && (
            <div className="meta-row">
              <strong>От:</strong> {email.accountEmail}
            </div>
          )}
          <div className="meta-row">
            <strong>Дата:</strong>{" "}
            {new Date(email.date).toLocaleString("ru-RU")}
          </div>
          <div className="meta-row">
            <strong>Ящик:</strong> {email.accountName} ({email.accountEmail})
          </div>
        </div>

        {(email.attachments?.length ?? 0) > 0 && (
          <div className="email-attachments">
            <div className="email-attachments-title">
              <PaperclipIcon />
              <span>
                {email.attachments!.length === 1
                  ? "1 вложение"
                  : `${email.attachments!.length} вложения`}
              </span>
            </div>
            <ul className="email-attachments-list">
              {email.attachments!.map((att) => {
                const canPreview = isPreviewableAttachment(
                  att.contentType,
                  att.filename
                );
                const params = new URLSearchParams({
                  accountId: email.accountId,
                  uid: String(email.uid),
                  folder: emailFolder,
                  part: att.partId,
                  filename: att.filename,
                  contentType: att.contentType,
                });
                if (att.size) params.set("size", String(att.size));

                return (
                  <li key={att.partId}>
                    {canPreview ? (
                      <button
                        type="button"
                        className="email-attachment-item"
                        onClick={() =>
                          openAttachmentViewer(
                            `/view?${params.toString()}`,
                            `mailer-view-${email.uid}-${att.partId}`
                          )
                        }
                      >
                        <span className="email-attachment-name">{att.filename}</span>
                        {att.size ? (
                          <span className="email-attachment-size">
                            {formatAttachmentSize(att.size)}
                          </span>
                        ) : null}
                      </button>
                    ) : (
                      <a
                        className="email-attachment-item"
                        href={`/api/emails/attachments?${params.toString()}`}
                        download={att.filename}
                      >
                        <span className="email-attachment-name">{att.filename}</span>
                        {att.size ? (
                          <span className="email-attachment-size">
                            {formatAttachmentSize(att.size)}
                          </span>
                        ) : null}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {email.html ? (
          <div
            className="email-body-html"
            dangerouslySetInnerHTML={{ __html: email.html }}
          />
        ) : (
          <div className="email-body">{email.text || "(пустое письмо)"}</div>
        )}
      </div>
    </div>
  );
}
