"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ComposeEditor,
  type ComposeEditorHandle,
} from "@/components/ComposeEditor";
import type { MailFolderId } from "@/lib/folders";
import { htmlToPlainText, isHtmlEmpty, buildComposeHtml, replaceComposeSignatureHtml, EMPTY_EDITOR_HTML } from "@/lib/html-utils";
import { formatAttachmentSize } from "@/lib/attachments";
import type { MailAccount, MailTemplate } from "@/lib/types";

export interface ComposeReplyTo {
  accountId: string;
  folder: MailFolderId;
  uid: number;
}

export interface ComposeDraft {
  accountId: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  title: string;
  replyTo?: ComposeReplyTo;
}

interface PendingAttachment {
  id: string;
  file: File;
}

interface ComposeModalProps {
  accounts: MailAccount[];
  draft: ComposeDraft;
  onClose: () => void;
  onSent: () => void;
  onSendError?: (message: string) => void;
}

interface PendingSendPayload {
  accountId: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  text: string;
  attachments: {
    filename: string;
    contentType: string;
    content: string;
  }[];
  replyTo?: ComposeReplyTo;
}

const SEND_UNDO_SECONDS = 5;
const UNDO_RING_RADIUS = 13;
const UNDO_RING_CIRCUMFERENCE = 2 * Math.PI * UNDO_RING_RADIUS;

function UndoCountdownRing({
  seconds,
  total,
}: {
  seconds: number;
  total: number;
}) {
  const progress = 1 - seconds / total;
  const offset = UNDO_RING_CIRCUMFERENCE * (1 - progress);

  return (
    <div className="compose-undo-ring-wrap" aria-hidden>
      <svg className="compose-undo-ring" viewBox="0 0 36 36">
        <circle
          className="compose-undo-ring-track"
          cx="18"
          cy="18"
          r={UNDO_RING_RADIUS}
        />
        <circle
          className="compose-undo-ring-progress"
          cx="18"
          cy="18"
          r={UNDO_RING_RADIUS}
          strokeDasharray={UNDO_RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform="rotate(-90 18 18)"
        />
      </svg>
      <span className="compose-undo-ring-value">{seconds}</span>
    </div>
  );
}

function formatFromLabel(account: MailAccount): string {
  const name = (account.fromName || account.name).trim();
  return `${name} <${account.email}>`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Не удалось прочитать файл"));
        return;
      }
      const base64 = result.split(",")[1];
      if (!base64) {
        reject(new Error("Не удалось прочитать файл"));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Ошибка чтения файла"));
    reader.readAsDataURL(file);
  });
}

export function ComposeModal({
  accounts,
  draft,
  onClose,
  onSent,
  onSendError,
}: ComposeModalProps) {
  const [accountId, setAccountId] = useState(draft.accountId);
  const [to, setTo] = useState(draft.to);
  const [cc, setCc] = useState(draft.cc ?? "");
  const [bcc, setBcc] = useState(draft.bcc ?? "");
  const [subject, setSubject] = useState(draft.subject);
  const [showCc, setShowCc] = useState(Boolean(draft.cc));
  const [showBcc, setShowBcc] = useState(Boolean(draft.bcc));
  const [minimized, setMinimized] = useState(false);
  const [error, setError] = useState("");
  const [sendUndoSeconds, setSendUndoSeconds] = useState<number | null>(null);
  const [undoHover, setUndoHover] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [fromOpen, setFromOpen] = useState(false);
  const [editorHtml, setEditorHtml] = useState(draft.html);
  const [size, setSize] = useState({ width: 1020, height: 850 });
  const [dragOver, setDragOver] = useState(false);

  const editorRef = useRef<ComposeEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const pendingSendRef = useRef<PendingSendPayload | null>(null);
  const undoIntervalRef = useRef<number | null>(null);
  const signatureAccountIdRef = useRef(draft.accountId);

  const selectedAccount = accounts.find((item) => item.id === accountId);

  const applyAccountSignature = (nextAccountId: string, prevAccountId: string) => {
    const prevAccount = accounts.find((item) => item.id === prevAccountId);
    const nextAccount = accounts.find((item) => item.id === nextAccountId);
    const currentHtml = editorRef.current?.getHtml() ?? "";
    const newHtml = replaceComposeSignatureHtml(
      currentHtml,
      nextAccount?.signature,
      prevAccount?.signature
    );
    setEditorHtml(newHtml);
    editorRef.current?.setHtml(newHtml);
    signatureAccountIdRef.current = nextAccountId;
  };

  const handleAccountChange = (nextAccountId: string) => {
    if (nextAccountId === accountId) {
      setFromOpen(false);
      return;
    }
    applyAccountSignature(nextAccountId, accountId);
    setAccountId(nextAccountId);
    setFromOpen(false);
  };

  useEffect(() => {
    setAccountId(draft.accountId);
    setTo(draft.to);
    setCc(draft.cc ?? "");
    setBcc(draft.bcc ?? "");
    setSubject(draft.subject);
    setShowCc(Boolean(draft.cc));
    setShowBcc(Boolean(draft.bcc));
    setMinimized(false);
    setAttachments([]);
    setSize({ width: 1020, height: 850 });
    if (undoIntervalRef.current !== null) {
      window.clearInterval(undoIntervalRef.current);
      undoIntervalRef.current = null;
    }
    pendingSendRef.current = null;
    setSendUndoSeconds(null);
    setUndoHover(false);
    signatureAccountIdRef.current = draft.accountId;
    const account = accounts.find((item) => item.id === draft.accountId);
    let html = draft.html;
    if (!draft.replyTo && account?.signature) {
      const bare =
        html === EMPTY_EDITOR_HTML ||
        html.trim() === "<p><br></p>" ||
        isHtmlEmpty(html);
      if (bare) {
        html = buildComposeHtml(account.signature);
      }
    }
    setEditorHtml(html);
    editorRef.current?.setHtml(html);
  }, [draft]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (minimized) return;
      if (sendUndoSeconds !== null) return;
      if (!event.ctrlKey) return;
      if (event.key !== "Enter") return;
      // Срабатываем только для формы compose
      event.preventDefault();
      formRef.current?.requestSubmit();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [minimized, sendUndoSeconds]);

  const handleDropFiles = (files: FileList | null) => {
    setDragOver(false);
    handleFilesSelected(files);
  };

  useEffect(() => {
    void fetch("/api/templates")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: MailTemplate[]) => setTemplates(data))
      .catch(() => setTemplates([]));
  }, []);

  const handleFilesSelected = (files: FileList | null) => {
    if (!files?.length) return;
    const next = Array.from(files).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      file,
    }));
    setAttachments((prev) => {
      const existing = new Set(prev.map((item) => item.id));
      return [...prev, ...next.filter((item) => !existing.has(item.id))];
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const applyTemplate = (template: MailTemplate) => {
    editorRef.current?.insertHtml(template.html);
    if (template.subject && !subject.trim()) {
      setSubject(template.subject);
    }
    setMinimized(false);
    editorRef.current?.focus();
  };

  const startResize = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = size.width;
    const startHeight = size.height;

    const onMove = (moveEvent: MouseEvent) => {
      const maxWidth = window.innerWidth - 32;
      const maxHeight = window.innerHeight - 32;
      setSize({
        width: Math.min(
          maxWidth,
          Math.max(1020, startWidth + moveEvent.clientX - startX)
        ),
        height: Math.min(
          maxHeight,
          Math.max(520, startHeight + moveEvent.clientY - startY)
        ),
      });
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  useEffect(() => {
    return () => {
      if (undoIntervalRef.current !== null) {
        window.clearInterval(undoIntervalRef.current);
      }
    };
  }, []);

  const clearUndoCountdown = () => {
    if (undoIntervalRef.current !== null) {
      window.clearInterval(undoIntervalRef.current);
      undoIntervalRef.current = null;
    }
    pendingSendRef.current = null;
    setSendUndoSeconds(null);
    setUndoHover(false);
  };

  const cancelPendingSend = () => {
    clearUndoCountdown();
  };

  const sendInBackground = (payload: PendingSendPayload) => {
    void fetch("/api/emails/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: payload.accountId,
        to: payload.to,
        cc: payload.cc,
        bcc: payload.bcc,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        attachments: payload.attachments,
        replyTo: payload.replyTo,
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          onSendError?.(data.error || "Ошибка отправки");
        }
      })
      .catch(() => {
        onSendError?.("Не удалось отправить письмо");
      });
  };

  const flushPendingSend = () => {
    const payload = pendingSendRef.current;
    if (!payload) return;

    if (undoIntervalRef.current !== null) {
      window.clearInterval(undoIntervalRef.current);
      undoIntervalRef.current = null;
    }
    pendingSendRef.current = null;
    setSendUndoSeconds(null);
    setUndoHover(false);
    onSent();
    sendInBackground(payload);
  };

  const startSendUndoCountdown = (payload: PendingSendPayload) => {
    if (undoIntervalRef.current !== null) {
      window.clearInterval(undoIntervalRef.current);
      undoIntervalRef.current = null;
    }
    pendingSendRef.current = payload;
    let remaining = SEND_UNDO_SECONDS;
    setSendUndoSeconds(remaining);

    undoIntervalRef.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (undoIntervalRef.current !== null) {
          window.clearInterval(undoIntervalRef.current);
          undoIntervalRef.current = null;
        }
        flushPendingSend();
        return;
      }
      setSendUndoSeconds(remaining);
    }, 1000);
  };

  const handleClose = () => {
    cancelPendingSend();
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sendUndoSeconds !== null) return;
    setError("");

    const html = editorRef.current?.getHtml() ?? "";
    const plain = htmlToPlainText(html);
    if (!to.trim() || !subject.trim() || isHtmlEmpty(html)) {
      setError("Заполните получателя, тему и текст письма");
      return;
    }

    try {
      const encodedAttachments = await Promise.all(
        attachments.map(async (item) => ({
          filename: item.file.name,
          contentType: item.file.type || "application/octet-stream",
          content: await fileToBase64(item.file),
        }))
      );

      startSendUndoCountdown({
        accountId,
        to: to.trim(),
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        subject: subject.trim(),
        html,
        text: plain,
        attachments: encodedAttachments,
        replyTo: draft.replyTo,
      });
    } catch {
      setError("Не удалось подготовить письмо к отправке");
    }
  };

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const content = (
    <>
      {!minimized && <div className="compose-backdrop" aria-hidden />}
      <div
        className={`compose-window ${minimized ? "compose-window--minimized" : ""} ${
          dragOver ? "compose-window--dragover" : ""
        }`}
        style={
          minimized
            ? undefined
            : { width: size.width, height: size.height }
        }
        role="dialog"
        aria-label={draft.title}
        onDragEnter={(e) => {
          if (minimized) return;
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          if (minimized) return;
          e.preventDefault();
          e.stopPropagation();
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (minimized) return;
          e.preventDefault();
          e.stopPropagation();
          const related = e.relatedTarget as Node | null;
          if (!related || !e.currentTarget.contains(related)) {
            setDragOver(false);
          }
        }}
        onDrop={(e) => {
          if (minimized) return;
          e.preventDefault();
          e.stopPropagation();
          void (e.dataTransfer?.files ? handleDropFiles(e.dataTransfer.files) : null);
        }}
      >
      <header
        className="compose-header"
        onClick={minimized ? () => setMinimized(false) : undefined}
      >
        <span className="compose-header-title">{draft.title}</span>
        <div
          className="compose-header-actions"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="compose-header-btn"
            onClick={() => setMinimized((value) => !value)}
            aria-label={minimized ? "Развернуть" : "Свернуть"}
            title={minimized ? "Развернуть" : "Свернуть"}
          >
            {minimized ? "▢" : "—"}
          </button>
          <button
            type="button"
            className="compose-header-btn"
            onClick={handleClose}
            aria-label="Закрыть"
            title="Закрыть"
          >
            ×
          </button>
        </div>
      </header>

      {!minimized && (
        <form ref={formRef} className="compose-form" onSubmit={handleSubmit}>
          {error && <div className="error-banner compose-error">{error}</div>}

          <div className="compose-field compose-field--to">
            <label htmlFor="compose-to">Кому</label>
            <input
              id="compose-to"
              type="text"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="recipient@example.com"
              required
            />
          </div>

          {showCc && (
            <div className="compose-field">
              <label htmlFor="compose-cc">Копия</label>
              <input
                id="compose-cc"
                type="text"
                value={cc}
                onChange={(event) => setCc(event.target.value)}
              />
            </div>
          )}

          {showBcc && (
            <div className="compose-field">
              <label htmlFor="compose-bcc">Скрытая</label>
              <input
                id="compose-bcc"
                type="text"
                value={bcc}
                onChange={(event) => setBcc(event.target.value)}
              />
            </div>
          )}

          <div className="compose-field compose-field--from">
            <label>От кого</label>
            <div className="compose-from-wrap">
              <button
                type="button"
                className="compose-from-chip"
                onClick={() => setFromOpen((value) => !value)}
              >
                {selectedAccount ? formatFromLabel(selectedAccount) : "Выберите ящик"}
                <span className="compose-from-caret">▾</span>
              </button>
              {fromOpen && (
                <ul className="compose-from-menu">
                  {accounts.map((account) => (
                    <li key={account.id}>
                      <button
                        type="button"
                        onClick={() => handleAccountChange(account.id)}
                      >
                        {formatFromLabel(account)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="compose-field compose-field--subject">
            <label htmlFor="compose-subject">Тема</label>
            <input
              id="compose-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              required
            />
            <div className="compose-subject-actions">
              {!showCc && (
                <button type="button" onClick={() => setShowCc(true)}>
                  Копия
                </button>
              )}
              {!showBcc && (
                <button type="button" onClick={() => setShowBcc(true)}>
                  Скрытая
                </button>
              )}
            </div>
          </div>

          <div className="compose-attach-row">
            <button
              type="button"
              className="compose-attach-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <span aria-hidden>📎</span> Прикрепить файл
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(event) => handleFilesSelected(event.target.files)}
            />
          </div>

          {attachments.length > 0 && (
            <ul className="compose-attachments-list">
              {attachments.map((item) => (
                <li key={item.id} className="compose-attachment-chip">
                  <span className="compose-attachment-name">{item.file.name}</span>
                  <span className="compose-attachment-size">
                    {formatAttachmentSize(item.file.size)}
                  </span>
                  <button
                    type="button"
                    className="compose-attachment-remove"
                    onClick={() => removeAttachment(item.id)}
                    aria-label="Удалить вложение"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="compose-editor-wrap">
            <ComposeEditor
              key={`${draft.accountId}-${draft.title}-${draft.to}-${draft.subject}`}
              ref={editorRef}
              initialHtml={editorHtml}
              showTemplates
              templates={templates}
              onApplyTemplate={applyTemplate}
            />
          </div>

          <footer className="compose-footer">
            {sendUndoSeconds !== null ? (
              <div className="compose-send-undo">
                <button
                  type="button"
                  className="compose-undo-cancel"
                  onClick={cancelPendingSend}
                >
                  Отменить отправку
                </button>
                <div
                  className="compose-undo-timer"
                  onMouseEnter={() => setUndoHover(true)}
                  onMouseLeave={() => setUndoHover(false)}
                >
                  {undoHover ? (
                    <button
                      type="button"
                      className="compose-undo-skip"
                      onClick={flushPendingSend}
                      title="Отправить сейчас"
                      aria-label="Отправить сейчас"
                    >
                      ×
                    </button>
                  ) : (
                    <UndoCountdownRing
                      seconds={sendUndoSeconds}
                      total={SEND_UNDO_SECONDS}
                    />
                  )}
                </div>
              </div>
            ) : (
              <>
                <button
                  type="submit"
                  className="btn btn-primary compose-send-btn"
                >
                  Отправить
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleClose}
                >
                  Отменить
                </button>
              </>
            )}
          </footer>
        </form>
      )}
      {!minimized && (
        <div
          className="compose-resize-handle"
          onMouseDown={startResize}
          aria-hidden
        />
      )}
      </div>
    </>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}
