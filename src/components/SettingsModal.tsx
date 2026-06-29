"use client";

import { useRef, useState } from "react";
import { AccountForm } from "@/components/AccountForm";
import {
  ComposeEditor,
  type ComposeEditorHandle,
} from "@/components/ComposeEditor";
import { FilterSettingsPanel } from "@/components/FilterSettingsPanel";
import { TemplateSettingsPanel } from "@/components/TemplateSettingsPanel";
import { isHtmlEmpty, richTextToEditorHtml } from "@/lib/html-utils";
import { LABEL_COLORS } from "@/lib/label-colors";
import type { MailAccount } from "@/lib/types";

type SettingsTab = "mailboxes" | "filters" | "templates";
type MailboxesView = "list" | "add" | "edit";

interface SettingsModalProps {
  accounts: MailAccount[];
  onClose: () => void;
  onChange: () => void;
}

export function SettingsModal({
  accounts,
  onClose,
  onChange,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>("mailboxes");
  const [view, setView] = useState<MailboxesView>("list");
  const [filtersPanelTitle, setFiltersPanelTitle] = useState("Фильтрация");
  const [templatesPanelTitle, setTemplatesPanelTitle] = useState("Шаблоны");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [fromName, setFromName] = useState("");
  const [color, setColor] = useState<string>(LABEL_COLORS[5]);
  const [signatureHtml, setSignatureHtml] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const signatureEditorRef = useRef<ComposeEditorHandle>(null);

  const editingAccount = accounts.find((account) => account.id === editingId);

  const resetEditForm = () => {
    setEditingId(null);
    setName("");
    setFromName("");
    setColor(LABEL_COLORS[5]);
    setSignatureHtml("");
    setError("");
    setView("list");
  };

  const openEdit = (account: MailAccount) => {
    setEditingId(account.id);
    setName(account.name ?? "");
    setFromName(account.fromName ?? "");
    setColor(account.color || LABEL_COLORS[5]);
    setSignatureHtml(richTextToEditorHtml(account.signature ?? ""));
    setError("");
    setView("edit");
  };

  const handleSaveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingId) return;
    setError("");
    setLoading(true);
    try {
      const signatureRaw =
        signatureEditorRef.current?.getHtml() ?? signatureHtml;
      const signature = isHtmlEmpty(signatureRaw) ? "" : signatureRaw;
      const res = await fetch(`/api/accounts/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, fromName, color, signature }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось сохранить");
        return;
      }
      resetEditForm();
      onChange();
    } catch {
      setError("Не удалось сохранить настройки ящика");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (account: MailAccount) => {
    if (
      !confirm(
        `Удалить ящик «${account.name}» (${account.email})? Это действие нельзя отменить.`
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${account.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Не удалось удалить ящик");
        return;
      }
      if (editingId === account.id) resetEditForm();
      onChange();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="settings-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <aside className="settings-tabs">
          <div className="settings-tabs-header">
            <h2>Настройки</h2>
          </div>
          <nav className="settings-tabs-nav">
            <button
              type="button"
              className={`settings-tab ${tab === "mailboxes" ? "active" : ""}`}
              onClick={() => {
                setTab("mailboxes");
                resetEditForm();
              }}
            >
              Почтовые ящики
            </button>
            <button
              type="button"
              className={`settings-tab ${tab === "filters" ? "active" : ""}`}
              onClick={() => {
                setTab("filters");
                resetEditForm();
              }}
            >
              Фильтрация
            </button>
            <button
              type="button"
              className={`settings-tab ${tab === "templates" ? "active" : ""}`}
              onClick={() => {
                setTab("templates");
                resetEditForm();
              }}
            >
              Шаблоны
            </button>
          </nav>
        </aside>

        <section className="settings-panel">
          <div className="settings-panel-header">
            <h3>
              {tab === "filters"
                ? filtersPanelTitle
                : tab === "templates"
                  ? templatesPanelTitle
                  : view === "add"
                    ? "Добавить ящик"
                    : view === "edit"
                      ? "Редактировать ящик"
                      : "Почтовые ящики"}
            </h3>
            <button
              type="button"
              className="settings-close-btn"
              onClick={onClose}
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>

          {error && tab === "mailboxes" && view !== "add" && (
            <div className="error-banner settings-error">{error}</div>
          )}

          {tab === "filters" && (
            <FilterSettingsPanel onTitleChange={setFiltersPanelTitle} />
          )}

          {tab === "templates" && (
            <TemplateSettingsPanel onTitleChange={setTemplatesPanelTitle} />
          )}

          {tab === "mailboxes" && view === "list" && (
            <div className="settings-mailboxes">
              <button
                type="button"
                className="btn btn-primary settings-add-btn"
                onClick={() => {
                  setError("");
                  setView("add");
                }}
              >
                + Добавить ящик
              </button>

              {accounts.length === 0 ? (
                <p className="settings-empty">Почтовые ящики не подключены</p>
              ) : (
                <ul className="settings-account-list">
                  {accounts.map((account) => (
                    <li key={account.id} className="settings-account-item">
                      <div className="settings-account-main">
                        <span
                          className="settings-account-dot"
                          style={{ backgroundColor: account.color }}
                        />
                        <div className="settings-account-info">
                          <div className="settings-account-name">
                            {account.name}
                          </div>
                          <div className="settings-account-email">
                            {account.email}
                            {account.fromName && (
                              <span className="settings-account-from">
                                {" "}
                                · {account.fromName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="settings-account-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => openEdit(account)}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(account)}
                          disabled={loading}
                        >
                          Удалить
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === "mailboxes" && view === "add" && (
            <div className="settings-form-wrap">
              <AccountForm
                embedded
                onCancel={() => setView("list")}
                onSuccess={() => {
                  setView("list");
                  onChange();
                }}
              />
            </div>
          )}

          {tab === "mailboxes" && view === "edit" && editingAccount && (
            <form className="settings-edit-form" onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label>Email</label>
                <input value={editingAccount.email} disabled />
              </div>

              <div className="form-group">
                <label>Название ящика</label>
                <input
                  value={name ?? ""}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Рабочая почта"
                  required
                />
                <p className="form-hint">
                  Отображается в списке ящиков и на бейдже письма
                </p>
              </div>

              <div className="form-group">
                <label>Имя отправителя</label>
                <input
                  value={fromName ?? ""}
                  onChange={(event) => setFromName(event.target.value)}
                  placeholder="Иван Иванов"
                />
                <p className="form-hint">
                  Как вас увидят получатели в поле «От». Если пусто — используется
                  название ящика
                </p>
              </div>

              <div className="form-group">
                <label>Цвет бейджа</label>
                <div className="color-picker">
                  {LABEL_COLORS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`color-swatch ${color === item ? "selected" : ""}`}
                      style={{ backgroundColor: item }}
                      onClick={() => setColor(item)}
                      aria-label={`Цвет ${item}`}
                    />
                  ))}
                </div>
              </div>

              <div className="form-group template-editor-group">
                <label>Подпись для новых писем</label>
                <div className="template-editor-wrap">
                  <ComposeEditor
                    key={editingId ?? "signature"}
                    ref={signatureEditorRef}
                    initialHtml={signatureHtml}
                    onChange={setSignatureHtml}
                  />
                </div>
                <p className="form-hint">
                  Подпись автоматически добавляется в новые письма и ответы с
                  этого ящика. Форматирование сохраняется.
                </p>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={resetEditForm}
                >
                  Назад
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? "Сохранение…" : "Сохранить"}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
