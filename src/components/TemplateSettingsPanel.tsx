"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ComposeEditor,
  type ComposeEditorHandle,
} from "@/components/ComposeEditor";
import { isHtmlEmpty, plainTextToHtml } from "@/lib/html-utils";
import type { MailTemplate } from "@/lib/types";

type TemplatesView = "list" | "edit";

interface TemplateFormState {
  name: string;
  subject: string;
  html: string;
}

const EMPTY_EDITOR_HTML = "<p><br></p>";

function emptyForm(): TemplateFormState {
  return { name: "", subject: "", html: EMPTY_EDITOR_HTML };
}

function templateHtmlToEditor(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return EMPTY_EDITOR_HTML;
  if (!/<[a-z][\s\S]*>/i.test(trimmed)) {
    return plainTextToHtml(trimmed);
  }
  return trimmed;
}

function templateToForm(template: MailTemplate): TemplateFormState {
  return {
    name: template.name,
    subject: template.subject,
    html: templateHtmlToEditor(template.html),
  };
}

interface TemplateSettingsPanelProps {
  onTitleChange?: (title: string) => void;
}

export function TemplateSettingsPanel({
  onTitleChange,
}: TemplateSettingsPanelProps) {
  const [view, setView] = useState<TemplatesView>("list");
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateFormState>(emptyForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const editorRef = useRef<ComposeEditorHandle>(null);

  const loadTemplates = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch("/api/templates");
      const data = await res.json();
      if (res.ok) setTemplates(data);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    onTitleChange?.(view === "edit" ? (editingId ? "Редактировать шаблон" : "Новый шаблон") : "Шаблоны");
  }, [view, editingId, onTitleChange]);

  const backToList = () => {
    setView("list");
    setEditingId(null);
    setForm(emptyForm());
    setError("");
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError("");
    setView("edit");
  };

  const openEdit = (template: MailTemplate) => {
    setEditingId(template.id);
    setForm(templateToForm(template));
    setError("");
    setView("edit");
  };

  const handleDelete = async (template: MailTemplate) => {
    if (!confirm(`Удалить шаблон «${template.name}»?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/templates/${template.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Не удалось удалить");
        return;
      }
      await loadTemplates();
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    const html = editorRef.current?.getHtml() ?? form.html;
    if (isHtmlEmpty(html)) {
      setError("Заполните текст шаблона");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: form.name,
        subject: form.subject,
        html,
      };
      const res = await fetch(
        editingId ? `/api/templates/${editingId}` : "/api/templates",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось сохранить");
        return;
      }
      await loadTemplates();
      backToList();
    } catch {
      setError("Не удалось сохранить шаблон");
    } finally {
      setLoading(false);
    }
  };

  if (view === "edit") {
    return (
      <form className="template-settings-form" onSubmit={handleSave}>
        <div className="template-settings-form-scroll">
          {error && <div className="error-banner settings-error">{error}</div>}

          <div className="form-group">
            <label>Название</label>
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Приветствие"
              required
            />
          </div>

          <div className="form-group">
            <label>Тема (необязательно)</label>
            <input
              value={form.subject}
              onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
              placeholder="Подставляется при вставке шаблона"
            />
          </div>

          <div className="form-group template-editor-group">
            <label>Текст шаблона</label>
            <div className="template-editor-wrap">
              <ComposeEditor
                key={editingId ?? "new"}
                ref={editorRef}
                initialHtml={form.html}
              />
            </div>
            <p className="form-hint">
              Форматирование сохраняется и вставляется в письмо как есть.
            </p>
          </div>
        </div>

        <div className="form-actions template-settings-form-actions">
          <button type="button" className="btn btn-secondary" onClick={backToList}>
            Назад
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="template-settings">
      {error && <div className="error-banner settings-error">{error}</div>}

      <button type="button" className="btn btn-primary settings-add-btn" onClick={openCreate}>
        + Добавить шаблон
      </button>

      {listLoading ? (
        <p className="settings-empty">Загрузка…</p>
      ) : templates.length === 0 ? (
        <p className="settings-empty">Шаблоны не созданы</p>
      ) : (
        <ul className="template-settings-list">
          {templates.map((template) => (
            <li key={template.id} className="template-settings-item">
              <div className="template-settings-item-main">
                <div className="template-settings-item-name">{template.name}</div>
                {template.subject && (
                  <div className="template-settings-item-subject">
                    Тема: {template.subject}
                  </div>
                )}
              </div>
              <div className="settings-account-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => openEdit(template)}
                >
                  Изменить
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(template)}
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
  );
}
