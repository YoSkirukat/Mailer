"use client";

import { useEffect, useState } from "react";
import type { MailFolderId } from "@/lib/folders";
import type { MailAccount } from "@/lib/types";
import { replaceComposeSignature } from "@/lib/email-utils";

export interface ComposeReplyTo {
  accountId: string;
  folder: MailFolderId;
  uid: number;
}

export interface ComposeDraft {
  accountId: string;
  to: string;
  subject: string;
  text: string;
  title: string;
  replyTo?: ComposeReplyTo;
}

interface ComposeModalProps {
  accounts: MailAccount[];
  draft: ComposeDraft;
  onClose: () => void;
  onSent: () => void;
}

export function ComposeModal({
  accounts,
  draft,
  onClose,
  onSent,
}: ComposeModalProps) {
  const [accountId, setAccountId] = useState(draft.accountId);
  const [to, setTo] = useState(draft.to);
  const [subject, setSubject] = useState(draft.subject);
  const [text, setText] = useState(draft.text);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setAccountId(draft.accountId);
    setTo(draft.to);
    setSubject(draft.subject);
    setText(draft.text);
  }, [draft]);

  const applySignatureForAccount = (nextAccountId: string) => {
    const oldAccount = accounts.find((item) => item.id === accountId);
    const newAccount = accounts.find((item) => item.id === nextAccountId);
    setText((current) =>
      replaceComposeSignature(
        current,
        newAccount?.signature,
        oldAccount?.signature
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          to,
          subject,
          text,
          replyTo: draft.replyTo,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка отправки");
        return;
      }
      onSent();
    } catch {
      setError("Не удалось отправить письмо");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{draft.title}</h2>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Отправить с</label>
            <select
              value={accountId}
              onChange={(e) => {
                const nextId = e.target.value;
                setAccountId(nextId);
                applySignatureForAccount(nextId);
              }}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.email})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Кому</label>
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label>Тема</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Сообщение</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? "Отправка…" : "Отправить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
