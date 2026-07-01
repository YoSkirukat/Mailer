"use client";

import {
  getFolderLabel,
  isValidFolderId,
  type MailFolderId,
} from "@/lib/folders";
import { emailDetailKey } from "@/lib/email-detail-utils";
import { LabelBadgeList } from "@/components/LabelBadge";
import { PeerAvatar } from "@/components/PeerAvatar";
import { formatPeerDisplayName } from "@/lib/email-utils";
import type { EmailSummary } from "@/lib/types";

interface EmailListProps {
  emails: EmailSummary[];
  loading: boolean;
  folder: MailFolderId;
  selectedUid?: number;
  selectedAccountId?: string;
  selectedFolder?: string;
  checkedKeys: ReadonlySet<string>;
  emptyMessage?: string;
  showFolderBadges?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onSelect: (email: EmailSummary) => void;
  onMarkUnread: (email: EmailSummary) => void;
  onToggleCheck: (email: EmailSummary, checked: boolean) => void;
  onContextMenu: (email: EmailSummary, event: React.MouseEvent) => void;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}

function RepliedIcon() {
  return (
    <svg
      className="replied-icon"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

export function EmailList({
  emails,
  loading,
  folder,
  selectedUid,
  selectedAccountId,
  selectedFolder,
  checkedKeys,
  emptyMessage,
  showFolderBadges = false,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onSelect,
  onMarkUnread,
  onToggleCheck,
  onContextMenu,
}: EmailListProps) {
  const showInitialLoading = loading && emails.length === 0;
  const hasSelection = checkedKeys.size > 0;

  if (showInitialLoading) {
    return <div className="loading">Загрузка писем…</div>;
  }

  if (!loading && emails.length === 0) {
    return (
      <div className="loading">{emptyMessage ?? "В этой папке нет писем"}</div>
    );
  }

  const defaultPeerLabel = folder === "sent" ? "Кому" : "От";
  const showRepliedIndicator = folder === "inbox";

  return (
    <div className={`email-list-wrap ${loading ? "is-loading" : ""}`}>
      <div
        className={`email-list ${hasSelection ? "has-selection" : ""}`}
        aria-busy={loading}
      >
        {emails.map((email) => {
          const emailFolder = isValidFolderId(email.folder ?? "")
            ? email.folder
            : folder;
          const peerLabel = showFolderBadges
            ? emailFolder === "sent"
              ? "Кому"
              : "От"
            : defaultPeerLabel;
          const showReplied = showFolderBadges
            ? emailFolder === "inbox"
            : showRepliedIndicator;
          const isSelected =
            selectedUid === email.uid &&
            selectedAccountId === email.accountId &&
            (!showFolderBadges ||
              selectedFolder === (email.folder ?? folder));
          const selectionKey = emailDetailKey(email, folder);
          const isChecked = checkedKeys.has(selectionKey);
          const isUnread = !email.seen;
          const isReplied =
            showReplied && !isUnread && Boolean(email.answered);
          return (
            <div
              key={selectionKey}
              className={`email-item ${isUnread ? "unread" : "read"} ${isSelected ? "selected" : ""} ${isChecked ? "is-checked" : ""}`}
              onClick={() => onSelect(email)}
              onContextMenu={(e) => onContextMenu(email, e)}
            >
              <div className="email-item-leading">
                <div className="email-item-status">
                  {isUnread ? (
                    <span
                      className="read-status-dot read-status-dot--unread"
                      aria-label="Непрочитано"
                    />
                  ) : isReplied ? (
                    <span
                      className="replied-indicator"
                      title="Есть ответ"
                      aria-label="Есть ответ"
                    >
                      <RepliedIcon />
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="read-status-dot read-status-dot--read"
                      title="Пометить непрочитанным"
                      aria-label="Пометить непрочитанным"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkUnread(email);
                      }}
                    />
                  )}
                </div>
                <div className="email-item-avatar-slot">
                  <label
                    className="email-item-select"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) =>
                        onToggleCheck(email, e.target.checked)
                      }
                      aria-label="Выбрать письмо"
                    />
                  </label>
                  <PeerAvatar address={email.from} />
                </div>
              </div>
              <div className="email-item-body">
                <div className="top-row">
                  <span className="from">
                    <span className="peer-label">{peerLabel}:</span>{" "}
                    {formatPeerDisplayName(email.from)}
                  </span>
                  <span className="date">{formatDate(email.date)}</span>
                </div>
                <div className="subject">
                  {email.hasAttachments && (
                    <span className="email-has-attachment" title="Есть вложения">
                      📎
                    </span>
                  )}
                  <span className="subject-text">{email.subject}</span>
                </div>
                {email.snippet ? (
                  <div className="snippet">{email.snippet}</div>
                ) : null}
                <div className="email-item-footer">
                  {showFolderBadges &&
                    email.folder &&
                    isValidFolderId(email.folder) && (
                      <span className="folder-badge">
                        {getFolderLabel(email.folder)}
                      </span>
                    )}
                  <span
                    className="account-badge"
                    style={
                      email.accountColor
                        ? {
                            backgroundColor: `${email.accountColor}20`,
                            color: email.accountColor,
                            border: `1px solid ${email.accountColor}40`,
                          }
                        : undefined
                    }
                  >
                    {email.accountName}
                  </span>
                  <LabelBadgeList labels={email.labels ?? []} small />
                </div>
              </div>
            </div>
          );
        })}
        {hasMore && onLoadMore ? (
          <div className="email-list-load-more">
            <button
              type="button"
              className="btn btn-secondary email-list-load-more-btn"
              onClick={onLoadMore}
              disabled={loadingMore || loading}
            >
              {loadingMore ? "Загрузка…" : "Загрузить ещё"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
