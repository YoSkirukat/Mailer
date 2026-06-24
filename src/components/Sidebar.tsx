"use client";

import { FolderIcon } from "@/components/FolderIcon";
import { MailerLogo } from "@/components/MailerLogo";
import {
  MAIL_FOLDERS,
  type MailFolderId,
} from "@/lib/folders";
import { useTheme } from "@/components/ThemeProvider";
import type { MailAccount, MailLabel } from "@/lib/types";

interface SidebarProps {
  accounts: MailAccount[];
  labels: MailLabel[];
  labelUnreadCounts: Record<string, number>;
  selectedFolder: MailFolderId;
  selectedLabelId: string | null;
  selectedAccountId: string | null;
  unreadCounts: Record<MailFolderId, number>;
  refreshing?: boolean;
  onRefresh: () => void;
  onSelectFolder: (folder: MailFolderId) => void;
  onSelectLabel: (labelId: string) => void;
  onSelectAccount: (id: string | null) => void;
  onOpenSettings: () => void;
  onManageLabels: () => void;
  onCompose: () => void;
}

export function Sidebar({
  accounts,
  labels,
  labelUnreadCounts,
  selectedFolder,
  selectedLabelId,
  selectedAccountId,
  unreadCounts,
  refreshing = false,
  onRefresh,
  onSelectFolder,
  onSelectLabel,
  onSelectAccount,
  onOpenSettings,
  onManageLabels,
  onCompose,
}: SidebarProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <MailerLogo className="sidebar-brand-logo" />
        </div>
        <button
          type="button"
          className={`sidebar-refresh-btn ${refreshing ? "spinning" : ""}`}
          onClick={onRefresh}
          disabled={accounts.length === 0 || refreshing}
          title="Обновить почту"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      <button
        type="button"
        className="sidebar-compose-btn"
        onClick={onCompose}
        disabled={accounts.length === 0}
      >
        Написать
      </button>

      <nav className="folder-list">
        {MAIL_FOLDERS.map((folder) => {
          const unread = unreadCounts[folder.id] ?? 0;
          const isActive =
            selectedFolder === folder.id && selectedLabelId === null;
          return (
            <button
              key={folder.id}
              className={`folder-item ${isActive ? "active" : ""}`}
              onClick={() => onSelectFolder(folder.id)}
              disabled={accounts.length === 0}
            >
              <span className="folder-icon">
                <FolderIcon id={folder.id} />
              </span>
              <span className="folder-label">
                {folder.label}
                {unread > 0 && (
                  <span className="folder-unread"> ({unread})</span>
                )}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-labels-section">
        <div className="sidebar-section-row">
          <span className="sidebar-section-label">Ярлыки</span>
          <button
            type="button"
            className="sidebar-section-action"
            onClick={onManageLabels}
            title="Управление ярлыками"
          >
            +
          </button>
        </div>
        {labels.length === 0 ? (
          <p className="sidebar-empty-hint">Нет ярлыков</p>
        ) : (
          <div className="label-nav-list">
            {labels.map((label) => {
              const unread = labelUnreadCounts[label.id] ?? 0;
              return (
                <button
                  key={label.id}
                  type="button"
                  className={`label-nav-item ${selectedLabelId === label.id ? "active" : ""}`}
                  onClick={() => onSelectLabel(label.id)}
                  disabled={accounts.length === 0}
                >
                  <span
                    className="label-color-dot"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="label-nav-name">
                    {label.name}
                    {unread > 0 && (
                      <span className="folder-unread"> ({unread})</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="sidebar-section-label">Ящики</div>

      <div className="account-list">
        <button
          className={`account-item ${selectedAccountId === null ? "active" : ""}`}
          onClick={() => onSelectAccount(null)}
          disabled={accounts.length === 0}
        >
          <span className="account-avatar">∞</span>
          <span className="account-info">
            <div className="name">Все ящики</div>
            <div className="email">{accounts.length} подключено</div>
          </span>
        </button>

        {accounts.map((account) => (
          <button
            key={account.id}
            className={`account-item ${selectedAccountId === account.id ? "active" : ""}`}
            onClick={() => onSelectAccount(account.id)}
          >
            <span
              className="account-avatar"
              style={{ backgroundColor: `${account.color}22`, color: account.color }}
            >
              {account.name.charAt(0).toUpperCase()}
            </span>
            <span className="account-info">
              <div className="name">{account.name}</div>
              <div className="email">{account.email}</div>
            </span>
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-actions">
          <button className="btn btn-primary" onClick={onOpenSettings}>
            Настройки
          </button>
        </div>
        <div className="sidebar-footer-bar">
          <button
            type="button"
            className="theme-toggle theme-toggle-bottom"
            onClick={toggleTheme}
            title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
            aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          >
            {theme === "dark" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
