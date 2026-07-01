"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
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
  forwardSubject,
  replySubject,
  resolveReplyRecipient,
} from "@/lib/email-utils";
import {
  buildComposeHtml,
  buildForwardHtml,
  buildReplyQuoteHtml,
} from "@/lib/html-utils";
import { getFolderLabel, EMPTY_UNREAD_COUNTS, type MailFolderId } from "@/lib/folders";
import { emailDetailKey, summaryToPartialDetail } from "@/lib/email-detail-utils";
import {
  collectNewInboxEmails,
  emailNotificationKey,
  fetchInboxEmails,
  isNotificationSupported,
  notifyNewEmails,
  requestNotificationPermission,
} from "@/lib/notifications";
import type { EmailDetail, EmailSummary, MailAccount, MailLabel } from "@/lib/types";

const LIST_PAGE_SIZE = 50;

function mergeEmailSummaries(
  existing: EmailSummary[],
  next: EmailSummary[],
  folderFallback: MailFolderId
): EmailSummary[] {
  const seen = new Set(
    existing.map((email) =>
      emailDetailKey(email, (email.folder as MailFolderId) || folderFallback)
    )
  );
  const merged = [...existing];
  for (const email of next) {
    const folder = (email.folder as MailFolderId) || folderFallback;
    const key = emailDetailKey(email, folder);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(email);
  }
  return merged.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

function normalizeErrors(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function applyFilterErrors(
  filterErrors: unknown,
  setErrorsFn: Dispatch<SetStateAction<string[]>>
) {
  const nextErrors = normalizeErrors(filterErrors);
  if (nextErrors.length > 0) {
    setErrorsFn((prev) => [...new Set([...prev, ...nextErrors])]);
  }
}

const AUTO_REFRESH_MS = 20_000;

const emptyDraft = (accountId: string, accounts: MailAccount[]): ComposeDraft => {
  const account = accounts.find((item) => item.id === accountId);
  return {
    accountId,
    to: "",
    subject: "",
    html: buildComposeHtml(account?.signature),
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
  const [refreshing, setRefreshing] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [composeDraft, setComposeDraft] = useState<ComposeDraft | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [labels, setLabels] = useState<MailLabel[]>([]);
  const [showLabelManager, setShowLabelManager] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    email: EmailSummary;
    x: number;
    y: number;
  } | null>(null);
  const [checkedEmailKeys, setCheckedEmailKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [unreadCounts, setUnreadCounts] = useState(EMPTY_UNREAD_COUNTS);
  const [accountUnreadCounts, setAccountUnreadCounts] = useState<
    Record<string, number>
  >({});
  const [labelUnreadCounts, setLabelUnreadCounts] = useState<
    Record<string, number>
  >({});
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [emailFilter, setEmailFilter] = useState<EmailListFilter>("all");
  const [filterLabelId, setFilterLabelId] = useState<string | null>(null);
  const [unreadListMode, setUnreadListMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [listPage, setListPage] = useState(0);
  const [hasMoreEmails, setHasMoreEmails] = useState(false);
  const [loadingMoreEmails, setLoadingMoreEmails] = useState(false);
  const activeSearchRef = useRef(activeSearch);
  activeSearchRef.current = activeSearch;
  const countsRefreshTimer = useRef<number | null>(null);
  const loadEmailsRequestId = useRef(0);
  const silentLoadRequestId = useRef(0);
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const knownInboxKeysRef = useRef<Set<string>>(new Set());
  const inboxSnapshotReadyRef = useRef(false);
  const backgroundTickInFlightRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const selectedFolderRef = useRef(selectedFolder);
  selectedFolderRef.current = selectedFolder;
  const selectedAccountIdRef = useRef(selectedAccountId);
  selectedAccountIdRef.current = selectedAccountId;
  const selectedLabelIdRef = useRef(selectedLabelId);
  selectedLabelIdRef.current = selectedLabelId;
  const emailFilterRef = useRef(emailFilter);
  emailFilterRef.current = emailFilter;
  const composeDraftRef = useRef(composeDraft);
  composeDraftRef.current = composeDraft;
  const detailCacheRef = useRef<Map<string, EmailDetail>>(new Map());
  const prefetchInFlightRef = useRef<Set<string>>(new Set());
  const prefetchTimerRef = useRef<number | null>(null);

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

  const loadAccountUnreadCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts/unread");
      const data = await res.json();
      if (!data.error) setAccountUnreadCounts(data);
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
        loadAccountUnreadCounts();
      }, delayMs);
    },
    [loadUnreadCounts, loadLabelUnreadCounts, loadAccountUnreadCounts]
  );

  const refreshSidebarCounts = useCallback(
    (accountId?: string | null) => {
      if (countsRefreshTimer.current !== null) {
        window.clearTimeout(countsRefreshTimer.current);
        countsRefreshTimer.current = null;
      }
      loadUnreadCounts(accountId);
      loadLabelUnreadCounts(accountId);
      loadAccountUnreadCounts();
    },
    [loadUnreadCounts, loadLabelUnreadCounts, loadAccountUnreadCounts]
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
      search?: string | null,
      unreadOnly = false,
      options?: { silent?: boolean; append?: boolean; offset?: number }
    ): Promise<EmailSummary[] | undefined> => {
      const silent = options?.silent ?? false;
      if (silent && loadingRef.current) return;

      const userRequestAtStart = loadEmailsRequestId.current;
      const requestId = silent
        ? ++silentLoadRequestId.current
        : ++loadEmailsRequestId.current;
      const q = (
        search === undefined ? activeSearchRef.current : (search ?? "")
      ).trim();
      let appliedEmails: EmailSummary[] | undefined;

      const applyEmails = (
        nextEmails: EmailSummary[],
        nextErrors?: string[]
      ): boolean => {
        if (silent) {
          if (requestId !== silentLoadRequestId.current) return false;
          if (loadEmailsRequestId.current !== userRequestAtStart) return false;
          setEmails(nextEmails);
          if (nextErrors?.length) setErrors(nextErrors);
          appliedEmails = nextEmails;
          return true;
        }
        if (requestId !== loadEmailsRequestId.current) return false;
        setEmails(nextEmails);
        if (nextErrors !== undefined) setErrors(nextErrors);
        appliedEmails = nextEmails;
        return true;
      };

      if (!silent && !options?.append) {
        setLoading(true);
        setErrors([]);
      }
      if (!q && !labelId) {
        setUnreadListMode(unreadOnly);
      }
      try {
        if (q) {
          const params = new URLSearchParams({ q });
          if (accountId) params.set("accountId", accountId);
          const res = await fetch(`/api/emails?${params}`);
          const data = await res.json();
          if (Array.isArray(data)) {
            applyEmails(data);
          } else {
            applyEmails(data.emails || [], normalizeErrors(data.errors));
          }
          setHasMoreEmails(false);
          setListPage(0);
        } else if (labelId) {
          const params = new URLSearchParams();
          if (accountId) params.set("accountId", accountId);
          const query = params.toString();
          const res = await fetch(
            `/api/labels/${labelId}/emails${query ? `?${query}` : ""}`
          );
          const data = await res.json();
          if (!res.ok) {
            if (!silent) {
              applyEmails([], [data.error || "Не удалось загрузить письма"]);
            }
          } else {
            applyEmails(data.emails || []);
          }
          setHasMoreEmails(false);
          setListPage(0);
        } else {
          const params = new URLSearchParams({ folder });
          if (accountId) params.set("accountId", accountId);
          if (unreadOnly) params.set("unreadOnly", "1");
          params.set(
            "offset",
            String(options?.append ? (options.offset ?? 0) : 0)
          );
          params.set("limit", String(LIST_PAGE_SIZE));
          const res = await fetch(`/api/emails?${params}`);
          const data = await res.json();
          const nextEmails = Array.isArray(data) ? data : data.emails || [];
          const nextErrors = Array.isArray(data)
            ? []
            : normalizeErrors(data.errors);
          const nextHasMore = Array.isArray(data) ? false : Boolean(data.hasMore);

          if (options?.append) {
            const applyAppend = (): boolean => {
              if (silent) {
                if (requestId !== silentLoadRequestId.current) return false;
                if (loadEmailsRequestId.current !== userRequestAtStart) {
                  return false;
                }
              } else if (requestId !== loadEmailsRequestId.current) {
                return false;
              }

              setEmails((prev) =>
                mergeEmailSummaries(prev, nextEmails, folder)
              );
              if (nextErrors.length) setErrors(nextErrors);
              return true;
            };
            applyAppend();
          } else if (Array.isArray(data)) {
            applyEmails(data);
            setListPage(0);
          } else {
            applyEmails(nextEmails, nextErrors);
            setListPage(0);
          }
          setHasMoreEmails(nextHasMore);
        }
      } catch {
        if (!silent && requestId === loadEmailsRequestId.current) {
          setErrors(["Не удалось загрузить письма"]);
        }
      } finally {
        if (
          !silent &&
          !options?.append &&
          requestId === loadEmailsRequestId.current
        ) {
          setLoading(false);
        }
      }
      return appliedEmails;
    },
    []
  );

  const handleLoadMore = useCallback(async () => {
    if (
      loadingMoreEmails ||
      loading ||
      activeSearch ||
      selectedLabelId ||
      unreadListMode
    ) {
      return;
    }

    const nextPage = listPage + 1;
    const offset = nextPage * LIST_PAGE_SIZE;
    setLoadingMoreEmails(true);
    try {
      await loadEmails(
        selectedAccountId,
        selectedFolder,
        null,
        null,
        unreadListMode,
        { append: true, offset, silent: true }
      );
      setListPage(nextPage);
    } finally {
      setLoadingMoreEmails(false);
    }
  }, [
    activeSearch,
    listPage,
    loadEmails,
    loading,
    loadingMoreEmails,
    selectedAccountId,
    selectedFolder,
    selectedLabelId,
    unreadListMode,
  ]);

  const refreshList = useCallback(
    async (
      accountId?: string | null,
      refreshCounts = true,
      options?: {
        silent?: boolean;
        folder?: MailFolderId;
        labelId?: string | null;
        search?: string | null;
        unreadOnly?: boolean;
      }
    ): Promise<EmailSummary[] | undefined> => {
      const silent = options?.silent ?? false;
      const acc = accountId !== undefined ? accountId : selectedAccountId;
      const folder = options?.folder ?? selectedFolder;
      const labelId =
        options?.labelId !== undefined ? options.labelId : selectedLabelId;
      const search =
        options?.search !== undefined ? options.search : activeSearchRef.current;
      const searchQuery = (search ?? "").trim();
      const unreadOnly =
        options?.unreadOnly ??
        (emailFilter === "unread" && !searchQuery && !labelId);
      let emails: EmailSummary[] | undefined;
      if (searchQuery) {
        emails = await loadEmails(
          acc,
          folder,
          labelId,
          searchQuery,
          false,
          { silent }
        );
      } else if (labelId) {
        emails = await loadEmails(acc, folder, labelId, undefined, false, {
          silent,
        });
      } else {
        emails = await loadEmails(acc, folder, null, null, unreadOnly, { silent });
      }
      if (refreshCounts) {
        scheduleSidebarCounts(acc, silent ? 5000 : 2500);
      }
      return emails;
    },
    [loadEmails, selectedAccountId, selectedFolder, selectedLabelId, scheduleSidebarCounts, emailFilter]
  );

  const refreshInBackground = useCallback(
    async (overrides?: {
      folder?: MailFolderId;
      labelId?: string | null;
      search?: string | null;
      unreadOnly?: boolean;
    }) => {
      if (refreshInFlightRef.current) return;
      refreshInFlightRef.current = true;
      setRefreshing(true);
      try {
        await refreshList(undefined, true, { silent: true, ...overrides });
      } finally {
        refreshInFlightRef.current = false;
        setRefreshing(false);
      }
    },
    [refreshList]
  );

  const refreshListRef = useRef(refreshList);
  refreshListRef.current = refreshList;

  const updateInboxSnapshot = useCallback((inboxEmails: EmailSummary[]) => {
    const nextKeys = new Set(inboxEmails.map(emailNotificationKey));

    if (!inboxSnapshotReadyRef.current) {
      knownInboxKeysRef.current = nextKeys;
      inboxSnapshotReadyRef.current = true;
      return;
    }

    const newEmails = collectNewInboxEmails(
      inboxEmails,
      knownInboxKeysRef.current
    );
    knownInboxKeysRef.current = nextKeys;

    if (newEmails.length === 0 || document.visibilityState === "visible") return;

    void requestNotificationPermission().then(() => {
      notifyNewEmails(newEmails);
    });
  }, []);

  const canReuseListForInboxNotifications = useCallback(
    (listEmails: EmailSummary[] | undefined): listEmails is EmailSummary[] => {
      if (!listEmails) return false;
      return (
        !activeSearchRef.current &&
        !selectedLabelIdRef.current &&
        selectedFolderRef.current === "inbox" &&
        !selectedAccountIdRef.current &&
        emailFilterRef.current !== "unread"
      );
    },
    []
  );

  const runBackgroundTick = useCallback(async () => {
    if (backgroundTickInFlightRef.current) return;
    if (loadingRef.current || composeDraftRef.current) return;
    backgroundTickInFlightRef.current = true;
    try {
      const listEmails = await refreshListRef.current(undefined, true, {
        silent: true,
      });
      const inboxEmails = canReuseListForInboxNotifications(listEmails)
        ? listEmails
        : await fetchInboxEmails();
      updateInboxSnapshot(inboxEmails);
    } catch {
      /* фоновое обновление не должно ломать интерфейс */
    } finally {
      backgroundTickInFlightRef.current = false;
    }
  }, [canReuseListForInboxNotifications, updateInboxSnapshot]);

  const runBackgroundTickRef = useRef(runBackgroundTick);
  runBackgroundTickRef.current = runBackgroundTick;

  useEffect(() => {
    loadLabels();
    loadAccounts().then(async (accs) => {
      if (accs.length > 0) {
        const inboxEmails = await loadEmails(null, "inbox");
        if (inboxEmails) {
          knownInboxKeysRef.current = new Set(
            inboxEmails.map(emailNotificationKey)
          );
          inboxSnapshotReadyRef.current = true;
        }
        scheduleSidebarCounts(null, 3000);
        void requestNotificationPermission();
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

  useEffect(() => {
    if (accounts.length === 0) return;

    const tick = () => {
      void runBackgroundTickRef.current();
    };

    const intervalId = window.setInterval(tick, AUTO_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [accounts.length]);

  useEffect(() => {
    if (!toast) return;
    const timerId = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timerId);
  }, [toast]);

  useEffect(() => {
    if (emailFilter !== "unread" || activeSearch || selectedLabelId) return;
    loadEmails(selectedAccountId, selectedFolder, null, null, true);
  }, [
    emailFilter,
    selectedFolder,
    selectedAccountId,
    selectedLabelId,
    activeSearch,
    loadEmails,
  ]);

  const handleSearch = () => {
    const q = searchQuery.trim();
    setActiveSearch(q);
    loadEmails(selectedAccountId, selectedFolder, selectedLabelId, q || null);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setActiveSearch("");
    activeSearchRef.current = "";
    loadEmails(selectedAccountId, selectedFolder, selectedLabelId, "");
  };

  const handleComposeTo = (to: string) => {
    const accountId =
      selectedEmail?.accountId || selectedAccountId || accounts[0]?.id || "";
    const account = accounts.find((item) => item.id === accountId);
    setComposeDraft({
      accountId,
      to,
      subject: "",
      html: buildComposeHtml(account?.signature),
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
      email,
      emailFilter === "unread" && !selectedLabelId
    );
  };

  const handleSelectFolder = (folder: MailFolderId) => {
    const alreadyInInbox =
      folder === "inbox" &&
      selectedFolder === "inbox" &&
      selectedLabelId === null &&
      !activeSearchRef.current.trim();

    detailCacheRef.current.clear();
    prefetchInFlightRef.current.clear();
    setSelectedFolder(folder);
    setSelectedLabelId(null);
    setSelectedEmail(null);
    setActiveSearch("");
    setSearchQuery("");
    activeSearchRef.current = "";
    setListPage(0);
    setHasMoreEmails(false);

    if (folder === "inbox") {
      setEmailFilter("all");
      setFilterLabelId(null);
      setUnreadListMode(false);
      if (!alreadyInInbox) {
        setEmails([]);
      }
      void refreshInBackground({
        folder: "inbox",
        labelId: null,
        search: "",
        unreadOnly: false,
      });
      return;
    }

    loadEmails(
      selectedAccountId,
      folder,
      null,
      "",
      emailFilter === "unread"
    );
  };

  const handleSelectFolderRef = useRef(handleSelectFolder);
  handleSelectFolderRef.current = handleSelectFolder;

  useEffect(() => {
    const onFocusInbox = () => handleSelectFolderRef.current("inbox");
    document.addEventListener("mailer:focus-inbox", onFocusInbox);
    return () => document.removeEventListener("mailer:focus-inbox", onFocusInbox);
  }, []);

  const handleSelectLabel = (labelId: string) => {
    setSelectedLabelId(labelId);
    setSelectedEmail(null);
    setActiveSearch("");
    setSearchQuery("");
    activeSearchRef.current = "";
    loadEmails(selectedAccountId, selectedFolder, labelId, "");
  };

  const handleSelectAccount = (id: string | null) => {
    detailCacheRef.current.clear();
    prefetchInFlightRef.current.clear();
    setSelectedAccountId(id);
    setSelectedEmail(null);
    setActiveSearch("");
    setSearchQuery("");
    activeSearchRef.current = "";
    if (selectedLabelId) {
      loadEmails(id, selectedFolder, selectedLabelId, "");
    } else {
      loadEmails(id, selectedFolder, null, "", emailFilter === "unread");
    }
    refreshSidebarCounts(id);
  };

  const getEmailFolder = (email: EmailSummary): MailFolderId =>
    (email.folder as MailFolderId) || selectedFolder;

  const clearCheckedEmails = useCallback(() => {
    setCheckedEmailKeys(new Set());
  }, []);

  const toggleCheckedEmail = useCallback(
    (email: EmailSummary, checked: boolean) => {
      const folder: MailFolderId = selectedLabelId ? "inbox" : selectedFolder;
      const key = emailDetailKey(email, folder);
      setCheckedEmailKeys((prev) => {
        const next = new Set(prev);
        if (checked) next.add(key);
        else next.delete(key);
        return next;
      });
    },
    [selectedFolder, selectedLabelId]
  );

  const storeDetailInCache = useCallback((detail: EmailDetail, folder: MailFolderId) => {
    detailCacheRef.current.set(emailDetailKey(detail, folder), detail);
  }, []);

  const prefetchEmailDetails = useCallback(
    async (summaries: EmailSummary[]) => {
      const items = summaries
        .map((summary) => {
          const folder = getEmailFolder(summary);
          const key = emailDetailKey(summary, folder);
          if (
            detailCacheRef.current.has(key) ||
            prefetchInFlightRef.current.has(key)
          ) {
            return null;
          }
          prefetchInFlightRef.current.add(key);
          return {
            accountId: summary.accountId,
            folder,
            uid: summary.uid,
            key,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .slice(0, 12);

      if (items.length === 0) return;

      try {
        const res = await fetch("/api/emails/prefetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items.map(({ accountId, folder, uid }) => ({
              accountId,
              folder,
              uid,
            })),
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        for (const detail of (data.emails ?? []) as EmailDetail[]) {
          const folder = (detail.folder as MailFolderId) || selectedFolder;
          storeDetailInCache(detail, folder);
        }
      } catch {
        /* фоновая предзагрузка */
      } finally {
        for (const item of items) {
          prefetchInFlightRef.current.delete(item.key);
        }
      }
    },
    [selectedFolder, storeDetailInCache]
  );

  const applyOpenedEmail = useCallback(
    (summary: EmailSummary, detail: EmailDetail, folder: MailFolderId, wasUnread: boolean) => {
      setSelectedEmail(detail);
      setEmails((prev) =>
        prev.map((e) =>
          e.accountId === summary.accountId && e.uid === summary.uid
            ? {
                ...e,
                seen: true,
                hasAttachments: detail.hasAttachments,
                answered: detail.answered,
              }
            : e
        )
      );
      if (wasUnread) {
        setUnreadCounts((prev) => ({
          ...prev,
          [folder]: Math.max(0, (prev[folder] ?? 0) - 1),
        }));
        if (folder === "inbox") {
          setAccountUnreadCounts((prev) => ({
            ...prev,
            [summary.accountId]: Math.max(0, (prev[summary.accountId] ?? 0) - 1),
          }));
        }
        scheduleSidebarCounts(selectedAccountId);
      }
    },
    [scheduleSidebarCounts, selectedAccountId]
  );

  const handleSelectEmail = async (summary: EmailSummary) => {
    const wasUnread = !summary.seen;
    const folder = getEmailFolder(summary);
    const key = emailDetailKey(summary, folder);
    const cached = detailCacheRef.current.get(key);

    if (cached) {
      const detail = wasUnread ? { ...cached, seen: true } : cached;
      storeDetailInCache(detail, folder);
      applyOpenedEmail(summary, detail, folder, wasUnread);
      setLoadingEmail(false);

      if (wasUnread) {
        fetch(
          `/api/emails?accountId=${summary.accountId}&uid=${summary.uid}&folder=${folder}`
        )
          .then((res) => (res.ok ? res.json() : null))
          .then((data: (EmailDetail & { filterErrors?: string[] }) | null) => {
            if (!data) return;
            storeDetailInCache(data, folder);
            setSelectedEmail(data);
            applyFilterErrors(data.filterErrors, setErrors);
          })
          .catch(() => {});
      }
      return;
    }

    setSelectedEmail(summaryToPartialDetail(summary, folder));
    setLoadingEmail(true);

    try {
      const res = await fetch(
        `/api/emails?accountId=${summary.accountId}&uid=${summary.uid}&folder=${folder}`
      );
      if (!res.ok) {
        setSelectedEmail(null);
        return;
      }
      const data = (await res.json()) as EmailDetail & {
        filterErrors?: string[];
      };
      storeDetailInCache(data, folder);
      applyOpenedEmail(summary, data, folder, wasUnread);
      applyFilterErrors(data.filterErrors, setErrors);
    } catch {
      setSelectedEmail(null);
    } finally {
      setLoadingEmail(false);
    }
  };

  const listFolderForDisplay: MailFolderId = selectedLabelId
    ? "inbox"
    : selectedFolder;

  const isSameEmail = (a: EmailSummary, b: EmailSummary) =>
    a.accountId === b.accountId && a.uid === b.uid;

  const patchEmailSeen = (email: EmailSummary, seen: boolean) => {
    setEmails((prev) =>
      prev.map((e) =>
        e.accountId === email.accountId && e.uid === email.uid ? { ...e, seen } : e
      )
    );
    setSelectedEmail((prev) =>
      prev && prev.accountId === email.accountId && prev.uid === email.uid
        ? { ...prev, seen }
        : prev
    );
    setContextMenu((prev) =>
      prev &&
      prev.email.accountId === email.accountId &&
      prev.email.uid === email.uid
        ? { ...prev, email: { ...prev.email, seen } }
        : prev
    );
  };

  const patchAccountUnreadCount = (
    accountId: string,
    folder: MailFolderId,
    wasSeen: boolean,
    nowSeen: boolean
  ) => {
    if (wasSeen === nowSeen || folder !== "inbox") return;
    const delta = nowSeen ? -1 : 1;
    setAccountUnreadCounts((prev) => ({
      ...prev,
      [accountId]: Math.max(0, (prev[accountId] ?? 0) + delta),
    }));
  };

  const patchFolderUnreadCount = (
    folder: MailFolderId,
    wasSeen: boolean,
    nowSeen: boolean
  ) => {
    if (wasSeen === nowSeen) return;
    const delta = nowSeen ? -1 : 1;
    setUnreadCounts((prev) => ({
      ...prev,
      [folder]: Math.max(0, (prev[folder] ?? 0) + delta),
    }));
  };

  const runActionOnEmail = async (
    email: EmailSummary,
    action: "markRead" | "markUnread" | "delete" | "archive" | "spam" | "notSpam"
  ) => {
    const folder = getEmailFolder(email);
    const isSeenAction = action === "markRead" || action === "markUnread";
    const wasSeen = email.seen;
    const nextSeen =
      action === "markRead" ? true : action === "markUnread" ? false : wasSeen;

    if (isSeenAction) {
      patchEmailSeen(email, nextSeen);
      patchFolderUnreadCount(folder, wasSeen, nextSeen);
      patchAccountUnreadCount(email.accountId, folder, wasSeen, nextSeen);
    }

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
      if (isSeenAction) {
        patchEmailSeen(email, wasSeen);
        patchFolderUnreadCount(folder, nextSeen, wasSeen);
      }
      setErrors([data.error || "Не удалось выполнить действие"]);
      return false;
    }

    const removesFromList =
      action === "delete" ||
      action === "archive" ||
      action === "spam" ||
      action === "notSpam";

    if (
      selectedEmail &&
      selectedEmail.accountId === email.accountId &&
      selectedEmail.uid === email.uid &&
      removesFromList
    ) {
      setSelectedEmail(null);
    }

    if (isSeenAction) {
      scheduleSidebarCounts(selectedAccountId);
      return true;
    }

    await refreshList();
    return true;
  };

  const runBulkAction = async (
    action: "delete" | "archive" | "spam" | "notSpam"
  ) => {
    const folder: MailFolderId = selectedLabelId ? "inbox" : selectedFolder;
    const items = filteredEmails
      .filter((email) => checkedEmailKeys.has(emailDetailKey(email, folder)))
      .map((email) => ({
        accountId: email.accountId,
        uid: email.uid,
        folder: getEmailFolder(email),
      }));

    if (items.length === 0) return;

    setActionLoading(true);
    try {
      const res = await fetch("/api/emails/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, items }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors([data.error || "Не удалось выполнить действие"]);
        return;
      }
      if (data.errors?.length) {
        setErrors(data.errors);
      }
      clearCheckedEmails();
      if (
        selectedEmail &&
        items.some(
          (item) =>
            item.accountId === selectedEmail.accountId &&
            item.uid === selectedEmail.uid
        )
      ) {
        setSelectedEmail(null);
      }
      await refreshList();
    } finally {
      setActionLoading(false);
    }
  };

  const handleClearSpam = async () => {
    if (
      !window.confirm("Удалить все письма из папки «Спам»? Это действие нельзя отменить.")
    ) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch("/api/emails/clear-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder: "spam",
          accountId: selectedAccountId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors([data.error || "Не удалось очистить спам"]);
        return;
      }
      clearCheckedEmails();
      setSelectedEmail(null);
      await refreshList();
    } finally {
      setActionLoading(false);
    }
  };

  const fetchEmailDetail = async (summary: EmailSummary): Promise<EmailDetail | null> => {
    const folder = getEmailFolder(summary);
    const key = emailDetailKey(summary, folder);
    const cached = detailCacheRef.current.get(key);
    if (cached) return cached;

    const res = await fetch(
      `/api/emails?accountId=${summary.accountId}&uid=${summary.uid}&folder=${folder}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as EmailDetail;
    storeDetailInCache(data, folder);
    return data;
  };

  const handleReplyToEmail = async (summary: EmailSummary) => {
    const detail = await fetchEmailDetail(summary);
    if (!detail) {
      setErrors(["Не удалось загрузить письмо для ответа"]);
      return;
    }
    const folder = getEmailFolder(summary);
    const replyTo = resolveReplyRecipient(
      { ...detail, folder },
      { ownAddresses: accounts.map((item) => item.email) }
    );
    const account = accounts.find((item) => item.id === detail.accountId);
    setComposeDraft({
      accountId: detail.accountId,
      to: replyTo,
      subject: replySubject(detail.subject),
      html: buildComposeHtml(account?.signature, buildReplyQuoteHtml(detail)),
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
    action: "markRead" | "markUnread" | "delete" | "archive" | "spam" | "notSpam"
  ) => {
    if (!selectedEmail) return;
    const isSeenAction = action === "markRead" || action === "markUnread";
    if (!isSeenAction) setActionLoading(true);
    try {
      await runActionOnEmail({ ...selectedEmail }, action);
    } finally {
      if (!isSeenAction) setActionLoading(false);
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
        html: buildForwardHtml(selectedEmail),
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

    if (action === "spam") {
      runEmailAction("spam");
      return;
    }

    if (action === "notSpam") {
      runEmailAction("notSpam");
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

  useEffect(() => {
    clearCheckedEmails();
  }, [selectedFolder, selectedAccountId, selectedLabelId, activeSearch, clearCheckedEmails]);

  useEffect(() => {
    if (loading || emails.length === 0 || activeSearch) return;

    void prefetchEmailDetails(emails.slice(0, 3));

    if (prefetchTimerRef.current !== null) {
      window.clearTimeout(prefetchTimerRef.current);
    }
    prefetchTimerRef.current = window.setTimeout(() => {
      prefetchTimerRef.current = null;
      prefetchEmailDetails(emails.slice(0, 10));
    }, 800);

    return () => {
      if (prefetchTimerRef.current !== null) {
        window.clearTimeout(prefetchTimerRef.current);
        prefetchTimerRef.current = null;
      }
    };
  }, [emails, loading, activeSearch, prefetchEmailDetails]);

  useEffect(() => {
    if (!selectedEmail) return;
    const idx = filteredEmails.findIndex(
      (e) =>
        e.accountId === selectedEmail.accountId && e.uid === selectedEmail.uid
    );
    if (idx === -1) return;
    const neighbors = [
      filteredEmails[idx - 1],
      filteredEmails[idx + 1],
      filteredEmails[idx + 2],
    ].filter(Boolean) as EmailSummary[];
    prefetchEmailDetails(neighbors);
  }, [selectedEmail, filteredEmails, prefetchEmailDetails]);

  const listEmptyMessage =
    !loading && emails.length === 0 && activeSearch
      ? `Ничего не найдено по запросу «${activeSearch}»`
      : !loading &&
          emailFilter === "unread" &&
          unreadListMode &&
          emails.length === 0 &&
          (unreadCounts[selectedFolder] ?? 0) > 0
        ? "Не удалось загрузить непрочитанные письма. Попробуйте обновить список."
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
        accountUnreadCounts={accountUnreadCounts}
        refreshing={refreshing}
        onRefresh={() => void refreshInBackground()}
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
          <div className="panel-header-actions">
            {selectedFolder === "spam" &&
              !activeSearch &&
              !selectedLabelId &&
              accounts.length > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary clear-spam-btn"
                  onClick={handleClearSpam}
                  disabled={loading || actionLoading}
                >
                  Очистить СПАМ
                </button>
              )}
            {accounts.length > 0 && !activeSearch && (
              <EmailFilter
                filter={emailFilter}
                filterLabelId={filterLabelId}
                labels={labels}
                disabled={loading}
                onChange={(next, labelId) => {
                  const wasUnread = emailFilter === "unread";
                  setEmailFilter(next);
                  const nextLabelId = next === "label" ? (labelId ?? null) : null;
                  setFilterLabelId(nextLabelId);
                  if (activeSearch) return;
                  if (wasUnread && next !== "unread") {
                    loadEmails(
                      selectedAccountId,
                      selectedFolder,
                      nextLabelId ?? selectedLabelId
                    );
                  }
                }}
              />
            )}
          </div>
        </div>
        {checkedEmailKeys.size > 0 && (
          <div className="email-bulk-actions">
            <span className="email-bulk-actions-count">
              Выбрано: {checkedEmailKeys.size}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={actionLoading}
              onClick={() => runBulkAction("delete")}
            >
              Удалить
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={actionLoading || listFolderForDisplay === "archive"}
              onClick={() => runBulkAction("archive")}
            >
              В архив
            </button>
            {listFolderForDisplay === "spam" ? (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={actionLoading}
                onClick={() => runBulkAction("notSpam")}
              >
                Не спам
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={actionLoading}
                onClick={() => runBulkAction("spam")}
              >
                В спам
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              disabled={actionLoading}
              onClick={clearCheckedEmails}
            >
              Отмена
            </button>
          </div>
        )}
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
          hasMore={
            hasMoreEmails &&
            !activeSearch &&
            !selectedLabelId &&
            !unreadListMode
          }
          loadingMore={loadingMoreEmails}
          onLoadMore={handleLoadMore}
          selectedUid={selectedEmail?.uid}
          selectedAccountId={selectedEmail?.accountId}
          selectedFolder={selectedEmail?.folder}
          checkedKeys={checkedEmailKeys}
          emptyMessage={listEmptyMessage}
          onSelect={handleSelectEmail}
          onMarkUnread={(email) => runActionOnEmail(email, "markUnread")}
          onToggleCheck={toggleCheckedEmail}
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
            setToast({ message: "Письмо отправлено", type: "success" });
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
            void refreshList(undefined, true, { silent: true });
          }}
          onSendError={(message) => {
            setToast({
              message: message || "Не удалось отправить письмо",
              type: "error",
            });
          }}
        />
      )}

      {toast && (
        <div
          className={`app-toast app-toast--${toast.type}`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
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
