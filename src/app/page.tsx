"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SettingsModal } from "@/components/SettingsModal";
import { ComposeModal, type ComposeDraft } from "@/components/ComposeModal";
import { EmailContextMenu, type ContextMenuAction } from "@/components/EmailContextMenu";
import { EmailFilter, type EmailListFilter } from "@/components/EmailFilter";
import { EmailSearch } from "@/components/EmailSearch";
import { EmailList } from "@/components/EmailList";
import { EmailViewer, type EmailAction } from "@/components/EmailViewer";
import { LabelManagerModal } from "@/components/LabelManagerModal";
import { TabTitle } from "@/components/TabTitle";
import { Sidebar } from "@/components/Sidebar";
import {
  buildForwardBody,
  buildComposeText,
  buildReplyQuote,
  replaceComposeSignature,
  extractEmailAddress,
  forwardSubject,
  replySubject,
} from "@/lib/email-utils";
import { getFolderLabel, EMPTY_UNREAD_COUNTS, type MailFolderId } from "@/lib/folders";
import type { EmailDetail, EmailSummary, MailAccount, MailLabel } from "@/lib/types";

const emptyDraft = (accountId: string, accounts: MailAccount[]): ComposeDraft => {
  const account = accounts.find((item) => item.id === accountId);
  return {
    accountId,
    to: "",
    subject: "",
    text: buildComposeText(account?.signature),
    title: "Новое письмо",
  };
};

export default function HomePage() {
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<MailFolderId>("inbox");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [composeDraft, setComposeDraft] = useState<ComposeDraft | null>(null);
  const [labels, setLabels] = useState<MailLabel[]>([]);
  const [showLabelManager, setShowLabelManager] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    email: EmailSummary;
    x: number;
    y: number;
  } | null>(null);
  const [unreadCounts, setUnreadCounts] = useState(EMPTY_UNREAD_COUNTS);
  const [labelUnreadCounts, setLabelUnreadCounts] = useState<
    Record<string, number>
  >({});
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [emailFilter, setEmailFilter] = useState<EmailListFilter>("all");
  const [filterLabelId, setFilterLabelId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const activeSearchRef = useRef(activeSearch);
  activeSearchRef.current = activeSearch;
  const countsRefreshTimer = useRef<number | null>(null);
  const loadEmailsRequestId = useRef(0);

  const loadLabelUnreadCounts = useCallback(async (accountId?: string | null) => {
    try {
      const params = accountId ? `?accountId=${accountId}` : "";
      const res = await fetch(`/api/labels/unread${params}`);
      const data = await res.json();
      if (!data.error) setLabelUnreadCounts(data);
    } catch {
      /* сохраняем предыдущие значения */
    }
  }, []);

  const loadUnreadCounts = useCallback(async (accountId?: string | null) => {
    try {
      const params = accountId
        ? `?accountId=${accountId}`
        : "";
      const res = await fetch(`/api/folders/unread${params}`);
      const data = await res.json();
      if (!data.error) setUnreadCounts(data);
    } catch {
      /* сохраняем предыдущие значения */
    }
  }, []);

  const scheduleSidebarCounts = useCallback(
    (accountId?: string | null, delayMs = 1200) => {
      if (countsRefreshTimer.current !== null) {
        window.clearTimeout(countsRefreshTimer.current);
      }
      countsRefreshTimer.current = window.setTimeout(() => {
        countsRefreshTimer.current = null;
        loadUnreadCounts(accountId);
        loadLabelUnreadCounts(accountId);
      }, delayMs);
    },
    [loadUnreadCounts, loadLabelUnreadCounts]
  );

  const refreshSidebarCounts = useCallback(
    (accountId?: string | null) => {
      if (countsRefreshTimer.current !== null) {
        window.clearTimeout(countsRefreshTimer.current);
        countsRefreshTimer.current = null;
      }
      loadUnreadCounts(accountId);
      loadLabelUnreadCounts(accountId);
    },
    [loadUnreadCounts, loadLabelUnreadCounts]
  );

  const loadLabels = useCallback(async () => {
    const res = await fetch("/api/labels");
    const data = await res.json();
    setLabels(data);
    return data as MailLabel[];
  }, []);

  const loadAccounts = useCallback(async () => {
    const res = await fetch("/api/accounts");
    const data = (await res.json()) as MailAccount[];
    const normalized = data.map((account) => ({
      ...account,
      fromName: account.fromName ?? "",
      signature: account.signature ?? "",
      color: account.color || "#3b82f6",
    }));
    setAccounts(normalized);
    return normalized;
  }, []);

  const loadEmails = useCallback(
    async (
      accountId?: string | null,
      folder: MailFolderId = "inbox",
      labelId?: string | null,
      search?: string | null
    ) => {
      const requestId = ++loadEmailsRequestId.current;
      setLoading(true);
      setErrors([]);
      const q = (search ?? activeSearchRef.current).trim();
      try {
        if (q) {
          const params = new URLSearchParams({ q });
          if (accountId) params.set("accountId", accountId);
          const res = await fetch(`/api/emails?${params}`);
          const data = await res.json();
          if (requestId !== loadEmailsRequestId.current) return;
          if (Array.isArray(data)) {
            setEmails(data);
          } else {
            setEmails(data.emails || []);
            setErrors(data.errors || []);
          }
        } else if (labelId) {
          const params = new URLSearchParams();
          if (accountId) params.set("accountId", accountId);
          const query = params.toString();
          const res = await fetch(
            `/api/labels/${labelId}/emails${query ? `?${query}` : ""}`
          );
          const data = await res.json();
          if (requestId !== loadEmailsRequestId.current) return;
          if (!res.ok) {
            setErrors([data.error || "Не удалось загрузить письма"]);
            setEmails([]);
          } else {
            setEmails(data.emails || []);
          }
        } else {
          const params = new URLSearchParams({ folder });
          if (accountId) params.set("accountId", accountId);
          const res = await fetch(`/api/emails?${params}`);
          const data = await res.json();
          if (requestId !== loadEmailsRequestId.current) return;
          if (Array.isArray(data)) {
            setEmails(data);
          } else {
            setEmails(data.emails || []);
            setErrors(data.errors || []);
          }
        }
      } catch {
        if (requestId === loadEmailsRequestId.current) {
          setErrors(["Не удалось загрузить письма"]);
        }
      } finally {
        if (requestId === loadEmailsRequestId.current) {
          setLoading(false);
        }
      }
    },
    []
  );

  const refreshList = useCallback(
    async (accountId?: string | null, refreshCounts = true) => {
      const acc = accountId !== undefined ? accountId : selectedAccountId;
      if (activeSearchRef.current) {
        await loadEmails(acc, selectedFolder, selectedLabelId, activeSearchRef.current);
      } else if (selectedLabelId) {
        await loadEmails(acc, selectedFolder, selectedLabelId);
      } else {
        await loadEmails(acc, selectedFolder);
      }
      if (refreshCounts) {
        refreshSidebarCounts(acc);
      }
    },
    [loadEmails, selectedAccountId, selectedFolder, selectedLabelId, refreshSidebarCounts]
  );

  useEffect(() => {
    loadLabels();
    loadAccounts().then((accs) => {
      if (accs.length > 0) {
        loadEmails(null, "inbox");
        refreshSidebarCounts(null);
      } else setLoading(false);
    });
    return () => {
      if (countsRefreshTimer.current !== null) {
        window.clearTimeout(countsRefreshTimer.current);
      }
    };
    // Только при первом открытии приложения
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = () => {
    const q = searchQuery.trim();
    setActiveSearch(q);
    loadEmails(selectedAccountId, selectedFolder, selectedLabelId, q || null);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setActiveSearch("");
    loadEmails(selectedAccountId, selectedFolder, selectedLabelId, null);
  };

  const handleComposeTo = (to: string) => {
    const accountId =
      selectedEmail?.accountId || selectedAccountId || accounts[0]?.id || "";
    setComposeDraft({
      accountId,
      to,
      subject: "",
      text: "",
      title: "Новое письмо",
    });
  };

  const handleSearchFrom = (email: string) => {
    setSearchQuery(email);
    setActiveSearch(email);
    loadEmails(
      selectedAccountId,
      selectedFolder,
      selectedLabelId || undefined,
      email
    );
  };

  const handleSelectFolder = (folder: MailFolderId) => {
    setSelectedFolder(folder);
    setSelectedLabelId(null);
    setSelectedEmail(null);
    setActiveSearch("");
    setSearchQuery("");
    loadEmails(selectedAccountId, folder);
  };

  const handleSelectLabel = (labelId: string) => {
    setSelectedLabelId(labelId);
    setSelectedEmail(null);
    setActiveSearch("");
    setSearchQuery("");
    loadEmails(selectedAccountId, selectedFolder, labelId);
  };

  const handleSelectAccount = (id: string | null) => {
    setSelectedAccountId(id);
    setSelectedEmail(null);
    setActiveSearch("");
    setSearchQuery("");
    if (selectedLabelId) {
      loadEmails(id, selectedFolder, selectedLabelId);
    } else {
      loadEmails(id, selectedFolder);
    }
    refreshSidebarCounts(id);
  };

  const handleSelectEmail = async (summary: EmailSummary) => {
    const wasUnread = !summary.seen;
    setLoadingEmail(true);
    try {
      const folder = (summary.folder as MailFolderId) || selectedFolder;
      const res = await fetch(
        `/api/emails?accountId=${summary.accountId}&uid=${summary.uid}&folder=${folder}`
      );
      const data = await res.json();
      setSelectedEmail(data);
      setEmails((prev) =>
        prev.map((e) =>
          e.accountId === summary.accountId && e.uid === summary.uid
            ? {
                ...e,
                seen: true,
                hasAttachments: data.hasAttachments,
                answered: data.answered,
              }
            : e
        )
      );
      if (wasUnread) {
        const folderKey = (summary.folder as MailFolderId) || selectedFolder;
        setUnreadCounts((prev) => ({
          ...prev,
          [folderKey]: Math.max(0, (prev[folderKey] ?? 0) - 1),
        }));
        scheduleSidebarCounts(selectedAccountId);
      }
    } catch {
      setSelectedEmail(null);
    } finally {
      setLoadingEmail(false);
    }
  };

  const getEmailFolder = (email: EmailSummary): MailFolderId =>
    (email.folder as MailFolderId) || selectedFolder;

  const listFolderForDisplay: MailFolderId = selectedLabelId
    ? "inbox"
    : selectedFolder;

  const isSameEmail = (a: EmailSummary, b: EmailSummary) =>
    a.accountId === b.accountId && a.uid === b.uid;

  const runActionOnEmail = async (
    email: EmailSummary,
    action: "markRead" | "markUnread" | "delete" | "archive" | "spam"
  ) => {
    const folder = getEmailFolder(email);
    const res = await fetch("/api/emails/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: email.accountId,
        uid: email.uid,
        action,
        folder,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setErrors([data.error || "Не удалось выполнить действие"]);
      return false;
    }

    const removesFromList = action === "delete" || action === "archive" || action === "spam";
    if (
      selectedEmail &&
      selectedEmail.accountId === email.accountId &&
      selectedEmail.uid === email.uid
    ) {
      if (removesFromList) {
        setSelectedEmail(null);
      } else if (action === "markUnread") {
        setSelectedEmail({ ...selectedEmail, seen: false });
      } else if (action === "markRead") {
        setSelectedEmail({ ...selectedEmail, seen: true });
      }
    }

    await refreshList();
    return true;
  };

  const fetchEmailDetail = async (summary: EmailSummary): Promise<EmailDetail | null> => {
    const folder = getEmailFolder(summary);
    const res = await fetch(
      `/api/emails?accountId=${summary.accountId}&uid=${summary.uid}&folder=${folder}`
    );
    if (!res.ok) return null;
    return res.json();
  };

  const handleReplyToEmail = async (summary: EmailSummary) => {
    const detail = await fetchEmailDetail(summary);
    if (!detail) {
      setErrors(["Не удалось загрузить письмо для ответа"]);
      return;
    }
    const folder = getEmailFolder(summary);
    const replyTo =
      folder === "sent"
        ? extractEmailAddress(detail.to)
        : extractEmailAddress(detail.from);
    const account = accounts.find((item) => item.id === detail.accountId);
    setComposeDraft({
      accountId: detail.accountId,
      to: replyTo,
      subject: replySubject(detail.subject),
      text: buildComposeText(account?.signature, buildReplyQuote(detail)),
      title: "Ответить",
      replyTo: {
        accountId: summary.accountId,
        folder,
        uid: summary.uid,
      },
    });
  };

  const handleToggleLabel = async (email: EmailSummary, labelId: string) => {
    const folder = getEmailFolder(email);
    const assigned = email.labels?.some((l) => l.id === labelId);
    const res = await fetch("/api/emails/labels", {
      method: assigned ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: email.accountId,
        folder,
        uid: email.uid,
        labelId,
      }),
    });
    if (!res.ok) return;

    const label = labels.find((l) => l.id === labelId);
    if (!label) return;

    const newLabels = assigned
      ? (email.labels ?? []).filter((l) => l.id !== labelId)
      : [...(email.labels ?? []), label];

    setEmails((prev) =>
      prev.map((e) => (isSameEmail(e, email) ? { ...e, labels: newLabels } : e))
    );
    if (
      selectedEmail &&
      selectedEmail.accountId === email.accountId &&
      selectedEmail.uid === email.uid
    ) {
      setSelectedEmail({ ...selectedEmail, labels: newLabels });
    }
    setContextMenu((prev) =>
      prev && isSameEmail(prev.email, email)
        ? { ...prev, email: { ...prev.email, labels: newLabels } }
        : prev
    );
    scheduleSidebarCounts(selectedAccountId);
  };

  const handleContextMenuAction = async (
    action: ContextMenuAction,
    labelId?: string
  ) => {
    if (!contextMenu) return;
    const email = contextMenu.email;
    setContextMenu(null);

    switch (action) {
      case "open":
        await handleSelectEmail(email);
        break;
      case "reply":
        await handleReplyToEmail(email);
        break;
      case "markUnread":
        await runActionOnEmail(email, "markUnread");
        break;
      case "delete":
        if (!confirm("Удалить это письмо?")) return;
        await runActionOnEmail(email, "delete");
        break;
      case "archive":
        await runActionOnEmail(email, "archive");
        break;
      case "spam":
        await runActionOnEmail(email, "spam");
        break;
      case "toggleLabel":
        if (labelId) await handleToggleLabel(email, labelId);
        break;
      case "manageLabels":
        setShowLabelManager(true);
        break;
    }
  };

  const runEmailAction = async (
    action: "markRead" | "markUnread" | "delete" | "archive"
  ) => {
    if (!selectedEmail) return;
    setActionLoading(true);
    try {
      await runActionOnEmail({ ...selectedEmail }, action);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEmailAction = (action: EmailAction) => {
    if (!selectedEmail) return;

    if (action === "reply") {
      handleReplyToEmail(selectedEmail);
      return;
    }

    if (action === "forward") {
      setComposeDraft({
        accountId: selectedEmail.accountId,
        to: "",
        subject: forwardSubject(selectedEmail.subject),
        text: buildForwardBody(selectedEmail),
        title: "Переслать",
      });
      return;
    }

    if (action === "delete") {
      if (!confirm("Удалить это письмо?")) return;
      runEmailAction("delete");
      return;
    }

    if (action === "archive") {
      runEmailAction("archive");
      return;
    }

    if (action === "markUnread") {
      runEmailAction("markUnread");
      return;
    }

    if (action === "markRead") {
      runEmailAction("markRead");
    }
  };

  const handleSettingsChange = async () => {
    const hadAccounts = accounts.length > 0;
    const accs = await loadAccounts();

    if (accs.length === 0) {
      setSelectedAccountId(null);
      setSelectedEmail(null);
      setEmails([]);
      return;
    }

    if (
      !hadAccounts ||
      (selectedAccountId && !accs.some((item) => item.id === selectedAccountId))
    ) {
      setSelectedAccountId(null);
      setSelectedEmail(null);
      if (selectedLabelId) {
        loadEmails(null, selectedFolder, selectedLabelId);
      } else {
        loadEmails(null, selectedFolder);
      }
      refreshSidebarCounts(null);
      return;
    }

    refreshList();
  };

  const handleLabelsChange = (newLabels: MailLabel[]) => {
    if (!selectedEmail) return;
    setSelectedEmail({ ...selectedEmail, labels: newLabels });
    setEmails((prev) =>
      prev.map((e) =>
        e.accountId === selectedEmail.accountId && e.uid === selectedEmail.uid
          ? { ...e, labels: newLabels }
          : e
      )
    );
  };

  const handleLabelsUpdated = async () => {
    await loadLabels();
    await refreshList();
    if (selectedEmail) {
      const folder = (selectedEmail.folder as MailFolderId) || selectedFolder;
      const res = await fetch(
        `/api/emails?accountId=${selectedEmail.accountId}&uid=${selectedEmail.uid}&folder=${folder}`
      );
      const data = await res.json();
      setSelectedEmail(data);
    }
  };

  const defaultAccountId = selectedAccountId || accounts[0]?.id || "";
  const selectedLabel = labels.find((l) => l.id === selectedLabelId);

  const filteredEmails = useMemo(() => {
    switch (emailFilter) {
      case "unread":
        return emails.filter((e) => !e.seen);
      case "attachments":
        return emails.filter((e) => e.hasAttachments);
      case "label":
        if (!filterLabelId) return emails;
        return emails.filter((e) =>
          e.labels?.some((l) => l.id === filterLabelId)
        );
      default:
        return emails;
    }
  }, [emails, emailFilter, filterLabelId]);

  const listEmptyMessage =
    !loading && emails.length === 0 && activeSearch
      ? `Ничего не найдено по запросу «${activeSearch}»`
      : !loading && emails.length > 0 && filteredEmails.length === 0
        ? "Нет писем по выбранному фильтру"
        : undefined;

  const panelTitle = activeSearch
    ? `Поиск: ${activeSearch}`
    : selectedLabelId && selectedLabel
    ? selectedAccountId
      ? `${selectedLabel.name} — ${accounts.find((a) => a.id === selectedAccountId)?.name}`
      : selectedLabel.name
    : selectedAccountId
      ? `${getFolderLabel(selectedFolder)} — ${accounts.find((a) => a.id === selectedAccountId)?.name}`
      : getFolderLabel(selectedFolder);

  const tabFolderName = getFolderLabel(selectedFolder);
  const tabUnreadCount = unreadCounts[selectedFolder] ?? 0;

  return (
    <div className="app">
      <TabTitle folderName={tabFolderName} unreadCount={tabUnreadCount} />
      <Sidebar
        accounts={accounts}
        labels={labels}
        labelUnreadCounts={labelUnreadCounts}
        selectedFolder={selectedFolder}
        selectedLabelId={selectedLabelId}
        selectedAccountId={selectedAccountId}
        unreadCounts={unreadCounts}
        refreshing={loading}
        onRefresh={() => refreshList()}
        onSelectFolder={handleSelectFolder}
        onSelectLabel={handleSelectLabel}
        onSelectAccount={handleSelectAccount}
        onOpenSettings={() => setShowSettings(true)}
        onManageLabels={() => setShowLabelManager(true)}
        onCompose={() => setComposeDraft(emptyDraft(defaultAccountId, accounts))}
      />

      <div className="email-list-panel">
        <div className="panel-header">
          <h2>{panelTitle}</h2>
          {accounts.length > 0 && !activeSearch && (
            <EmailFilter
              filter={emailFilter}
              filterLabelId={filterLabelId}
              labels={labels}
              disabled={loading}
              onChange={(next, labelId) => {
                setEmailFilter(next);
                setFilterLabelId(next === "label" ? (labelId ?? null) : null);
              }}
            />
          )}
        </div>
        {errors.length > 0 && (
          <div style={{ padding: "8px 16px" }}>
            {errors.map((e, i) => (
              <div key={i} className="error-banner">
                {e}
              </div>
            ))}
          </div>
        )}
        <EmailList
          emails={filteredEmails}
          loading={loading}
          folder={listFolderForDisplay}
          showFolderBadges={Boolean(activeSearch)}
          selectedUid={selectedEmail?.uid}
          selectedAccountId={selectedEmail?.accountId}
          selectedFolder={selectedEmail?.folder}
          emptyMessage={listEmptyMessage}
          onSelect={handleSelectEmail}
          onMarkUnread={(email) => runActionOnEmail(email, "markUnread")}
          onContextMenu={(email, e) => {
            e.preventDefault();
            setContextMenu({ email, x: e.clientX, y: e.clientY });
          }}
        />
      </div>

      <div className="email-viewer-column">
        {accounts.length > 0 && (
          <div className="email-search-panel">
            <EmailSearch
              value={searchQuery}
              disabled={loading}
              searching={loading && Boolean(activeSearch)}
              onChange={setSearchQuery}
              onSearch={handleSearch}
              onClear={handleClearSearch}
            />
          </div>
        )}
        <EmailViewer
          email={selectedEmail}
          loading={loadingEmail}
          actionLoading={actionLoading}
          folder={
            selectedEmail ? getEmailFolder(selectedEmail) : listFolderForDisplay
          }
          onAction={handleEmailAction}
          onComposeTo={handleComposeTo}
          onSearchFrom={handleSearchFrom}
        />
      </div>

      {showSettings && (
        <SettingsModal
          accounts={accounts}
          onClose={() => setShowSettings(false)}
          onChange={handleSettingsChange}
        />
      )}

      {composeDraft && (
        <ComposeModal
          accounts={accounts}
          draft={composeDraft}
          onClose={() => setComposeDraft(null)}
          onSent={() => {
            const replied = composeDraft?.replyTo;
            setComposeDraft(null);
            if (replied) {
              setEmails((prev) =>
                prev.map((e) =>
                  e.accountId === replied.accountId && e.uid === replied.uid
                    ? { ...e, answered: true }
                    : e
                )
              );
              if (
                selectedEmail &&
                selectedEmail.accountId === replied.accountId &&
                selectedEmail.uid === replied.uid
              ) {
                setSelectedEmail({ ...selectedEmail, answered: true });
              }
            }
            refreshList();
          }}
        />
      )}

      {showLabelManager && (
        <LabelManagerModal
          labels={labels}
          onClose={() => setShowLabelManager(false)}
          onChange={handleLabelsUpdated}
        />
      )}

      {contextMenu && (
        <EmailContextMenu
          email={contextMenu.email}
          folder={getEmailFolder(contextMenu.email)}
          labels={labels}
          x={contextMenu.x}
          y={contextMenu.y}
          onAction={handleContextMenuAction}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
