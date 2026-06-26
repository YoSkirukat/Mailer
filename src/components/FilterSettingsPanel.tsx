"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FILTER_ACTION_OPTIONS,
  FILTER_FOLDER_OPTIONS,
  FILTER_MATCH_MODE_OPTIONS,
  FILTER_RULE_FIELD_OPTIONS,
  FILTER_RULE_OPERATOR_OPTIONS,
  newActionId,
  newRuleId,
} from "@/lib/filter-labels";
import type {
  FilterActionType,
  FilterMatchMode,
  FilterRuleField,
  FilterRuleOperator,
  MailFilter,
  MailFilterAction,
  MailFilterRule,
  MailLabel,
} from "@/lib/types";

type FiltersView = "list" | "edit";

interface FilterFormState {
  name: string;
  enabled: boolean;
  matchMode: FilterMatchMode;
  rules: MailFilterRule[];
  actions: MailFilterAction[];
}

function emptyForm(): FilterFormState {
  return {
    name: "",
    enabled: true,
    matchMode: "all",
    rules: [
      {
        id: newRuleId(),
        field: "from",
        operator: "contains",
        value: "",
      },
    ],
    actions: [
      {
        id: newActionId(),
        type: "move_to",
        value: "inbox",
      },
    ],
  };
}

function filterToForm(filter: MailFilter): FilterFormState {
  return {
    name: filter.name,
    enabled: filter.enabled,
    matchMode: filter.matchMode,
    rules: filter.rules.map((rule) => ({ ...rule })),
    actions: filter.actions.map((action) => ({ ...action })),
  };
}

function PlusIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
    </svg>
  );
}

interface FilterSettingsPanelProps {
  onTitleChange?: (title: string) => void;
}

export function FilterSettingsPanel({ onTitleChange }: FilterSettingsPanelProps) {
  const [view, setView] = useState<FiltersView>("list");
  const [filters, setFilters] = useState<MailFilter[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FilterFormState>(emptyForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [labels, setLabels] = useState<MailLabel[]>([]);

  const loadLabels = useCallback(async () => {
    try {
      const res = await fetch("/api/labels");
      const data = await res.json();
      if (res.ok) {
        setLabels(data);
      }
    } catch {
      /* ярлыки подгрузятся при следующей попытке */
    }
  }, []);

  const loadFilters = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch("/api/filters");
      const data = await res.json();
      if (res.ok) {
        setFilters(data);
      }
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFilters();
    loadLabels();
  }, [loadFilters, loadLabels]);

  useEffect(() => {
    if (!onTitleChange) return;
    if (view === "list") {
      onTitleChange("Фильтрация");
      return;
    }
    onTitleChange(editingId ? "Редактирование фильтра" : "Новый фильтр");
  }, [view, editingId, onTitleChange]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError("");
    setView("edit");
  };

  const openEdit = (filter: MailFilter) => {
    setEditingId(filter.id);
    setForm(filterToForm(filter));
    setError("");
    setView("edit");
  };

  const backToList = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError("");
    setView("list");
  };

  const toggleEnabled = async (filter: MailFilter) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/filters/${filter.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !filter.enabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось изменить фильтр");
        return;
      }
      setFilters((prev) =>
        prev.map((item) => (item.id === filter.id ? data : item))
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (filter: MailFilter) => {
    if (!confirm(`Удалить фильтр «${filter.name}»?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/filters/${filter.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Не удалось удалить фильтр");
        return;
      }
      setFilters((prev) => prev.filter((item) => item.id !== filter.id));
    } finally {
      setLoading(false);
    }
  };

  const updateRule = (id: string, patch: Partial<MailFilterRule>) => {
    setForm((prev) => ({
      ...prev,
      rules: prev.rules.map((rule) =>
        rule.id === id ? { ...rule, ...patch } : rule
      ),
    }));
  };

  const addRule = () => {
    setForm((prev) => ({
      ...prev,
      rules: [
        ...prev.rules,
        {
          id: newRuleId(),
          field: "from" as FilterRuleField,
          operator: "contains" as FilterRuleOperator,
          value: "",
        },
      ],
    }));
  };

  const removeRule = (id: string) => {
    setForm((prev) => ({
      ...prev,
      rules:
        prev.rules.length <= 1
          ? prev.rules
          : prev.rules.filter((rule) => rule.id !== id),
    }));
  };

  const updateAction = (id: string, patch: Partial<MailFilterAction>) => {
    setForm((prev) => ({
      ...prev,
      actions: prev.actions.map((action) => {
        if (action.id !== id) return action;
        const next = { ...action, ...patch };
        if (patch.type === "move_to") {
          next.value = patch.value ?? (next.value && FILTER_FOLDER_OPTIONS.some((f) => f.value === next.value) ? next.value : "inbox");
        }
        if (patch.type === "set_label") {
          const hasLabel = labels.some((label) => label.id === next.value);
          next.value = hasLabel ? next.value : labels[0]?.id ?? "";
        }
        if (patch.type === "forward_to") {
          next.value = patch.value ?? "";
        }
        if (patch.type === "mark_read" || patch.type === "delete") {
          next.value = "";
        }
        return next;
      }),
    }));
  };

  const addAction = () => {
    setForm((prev) => ({
      ...prev,
      actions: [
        ...prev.actions,
        {
          id: newActionId(),
          type: "move_to" as FilterActionType,
          value: "inbox",
        },
      ],
    }));
  };

  const removeAction = (id: string) => {
    setForm((prev) => ({
      ...prev,
      actions:
        prev.actions.length <= 1
          ? prev.actions
          : prev.actions.filter((action) => action.id !== id),
    }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = {
        name: form.name,
        enabled: form.enabled,
        matchMode: form.matchMode,
        rules: form.rules.map(({ field, operator, value }) => ({
          field,
          operator,
          value,
        })),
        actions: form.actions.map(({ type, value }) => ({ type, value })),
      };

      const res = await fetch(
        editingId ? `/api/filters/${editingId}` : "/api/filters",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось сохранить фильтр");
        return;
      }

      if (editingId) {
        setFilters((prev) =>
          prev.map((item) => (item.id === editingId ? data : item))
        );
      } else {
        setFilters((prev) => [...prev, data]);
      }
      backToList();
    } catch {
      setError("Не удалось сохранить фильтр");
    } finally {
      setLoading(false);
    }
  };

  const rulesHidden = form.matchMode === "all_messages";

  if (view === "edit") {
    return (
      <form className="filter-settings-form" onSubmit={handleSave}>
        {error && <div className="error-banner settings-error">{error}</div>}

        <div className="filter-form-row filter-form-toggle-row">
          <label className="filter-form-label">Фильтр включен</label>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, enabled: event.target.checked }))
              }
            />
            <span className="toggle-slider" />
          </label>
        </div>

        <div className="filter-form-row">
          <label className="filter-form-label" htmlFor="filter-name">
            Название фильтра
          </label>
          <input
            id="filter-name"
            className="filter-form-input"
            value={form.name}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, name: event.target.value }))
            }
            placeholder="Shoptrans"
            required
          />
        </div>

        <div className="filter-form-row">
          <label className="filter-form-label" htmlFor="filter-scope">
            Область
          </label>
          <select
            id="filter-scope"
            className="filter-form-input"
            value={form.matchMode}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                matchMode: event.target.value as FilterMatchMode,
              }))
            }
          >
            {FILTER_MATCH_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {!rulesHidden && (
          <div className="filter-form-section">
            <h4 className="filter-form-section-title">Правила</h4>
            {form.rules.map((rule) => (
              <div key={rule.id} className="filter-rule-row">
                <select
                  className="filter-form-input filter-rule-field"
                  value={rule.field}
                  onChange={(event) =>
                    updateRule(rule.id, {
                      field: event.target.value as FilterRuleField,
                    })
                  }
                >
                  {FILTER_RULE_FIELD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  className="filter-form-input filter-rule-operator"
                  value={rule.operator}
                  onChange={(event) =>
                    updateRule(rule.id, {
                      operator: event.target.value as FilterRuleOperator,
                    })
                  }
                >
                  {FILTER_RULE_OPERATOR_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  className="filter-form-input filter-rule-value"
                  value={rule.value}
                  onChange={(event) =>
                    updateRule(rule.id, { value: event.target.value })
                  }
                  placeholder="значение"
                />
                <div className="filter-row-actions">
                  <button
                    type="button"
                    className="filter-icon-btn"
                    onClick={addRule}
                    title="Добавить правило"
                  >
                    <PlusIcon />
                  </button>
                  <button
                    type="button"
                    className="filter-icon-btn filter-icon-btn-danger"
                    onClick={() => removeRule(rule.id)}
                    title="Удалить правило"
                    disabled={form.rules.length <= 1}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="filter-form-section">
          <h4 className="filter-form-section-title">Действия</h4>
          {form.actions.map((action) => (
            <div key={action.id} className="filter-action-row">
              <select
                className="filter-form-input filter-action-type"
                value={action.type}
                onChange={(event) =>
                  updateAction(action.id, {
                    type: event.target.value as FilterActionType,
                  })
                }
              >
                {FILTER_ACTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {action.type === "move_to" && (
                <select
                  className="filter-form-input filter-action-value"
                  value={action.value || "inbox"}
                  onChange={(event) =>
                    updateAction(action.id, { value: event.target.value })
                  }
                >
                  {FILTER_FOLDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              {action.type === "forward_to" && (
                <input
                  className="filter-form-input filter-action-value"
                  type="email"
                  value={action.value}
                  onChange={(event) =>
                    updateAction(action.id, { value: event.target.value })
                  }
                  placeholder="email@example.com"
                />
              )}
              {action.type === "set_label" && (
                labels.length > 0 ? (
                  <select
                    className="filter-form-input filter-action-value filter-action-label"
                    value={action.value || labels[0]?.id || ""}
                    onChange={(event) =>
                      updateAction(action.id, { value: event.target.value })
                    }
                  >
                    {labels.map((label) => (
                      <option key={label.id} value={label.id}>
                        {label.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="filter-action-hint">
                    Сначала создайте ярлык в боковой панели
                  </span>
                )
              )}
              {(action.type === "mark_read" || action.type === "delete") && (
                <span className="filter-action-placeholder" />
              )}
              <div className="filter-row-actions">
                <button
                  type="button"
                  className="filter-icon-btn"
                  onClick={addAction}
                  title="Добавить действие"
                >
                  <PlusIcon />
                </button>
                <button
                  type="button"
                  className="filter-icon-btn filter-icon-btn-danger"
                  onClick={() => removeAction(action.id)}
                  title="Удалить действие"
                  disabled={form.actions.length <= 1}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="form-actions filter-form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={backToList}
          >
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
    <div className="filter-settings-list">
      {error && <div className="error-banner settings-error">{error}</div>}

      <button
        type="button"
        className="btn btn-primary settings-add-btn"
        onClick={openCreate}
      >
        + Создать фильтр
      </button>

      {listLoading ? (
        <p className="settings-empty">Загрузка…</p>
      ) : filters.length === 0 ? (
        <p className="settings-empty">Фильтры не настроены</p>
      ) : (
        <ul className="filter-list">
          {filters.map((filter) => (
            <li key={filter.id} className="filter-list-item">
              <div className="filter-list-main">
                <label className="toggle-switch toggle-switch-sm">
                  <input
                    type="checkbox"
                    checked={filter.enabled}
                    onChange={() => toggleEnabled(filter)}
                    disabled={loading}
                  />
                  <span className="toggle-slider" />
                </label>
                <div className="filter-list-info">
                  <div className="filter-list-name">{filter.name}</div>
                  <div className="filter-list-meta">
                    {FILTER_MATCH_MODE_OPTIONS.find(
                      (option) => option.value === filter.matchMode
                    )?.label}
                    {filter.matchMode !== "all_messages" &&
                      ` · ${filter.rules.length} прав.`}
                    {` · ${filter.actions.length} действ.`}
                  </div>
                </div>
              </div>
              <div className="filter-list-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => openEdit(filter)}
                >
                  Изменить
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(filter)}
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
