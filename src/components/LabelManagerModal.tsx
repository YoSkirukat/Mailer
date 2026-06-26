"use client";

import { useState } from "react";
import { DEFAULT_LABEL_COLOR, LABEL_COLORS } from "@/lib/label-colors";
import type { MailLabel } from "@/lib/types";

interface LabelManagerModalProps {
  labels: MailLabel[];
  onClose: () => void;
  onChange: () => void;
}

export function LabelManagerModal({
  labels,
  onClose,
  onChange,
}: LabelManagerModalProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_LABEL_COLOR);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setName("");
    setColor(DEFAULT_LABEL_COLOR);
    setEditingId(null);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const url = editingId ? `/api/labels/${editingId}` : "/api/labels";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка сохранения");
        return;
      }
      resetForm();
      onChange();
    } catch {
      setError("Не удалось сохранить ярлык");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (label: MailLabel) => {
    setEditingId(label.id);
    setName(label.name);
    setColor(label.color);
    setError("");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить этот ярлык? Он будет снят со всех писем.")) return;
    setLoading(true);
    try {
      await fetch(`/api/labels/${id}`, { method: "DELETE" });
      if (editingId === id) resetForm();
      onChange();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal label-manager-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Ярлыки</h2>
        <p className="confirm-message">
          Создавайте цветные ярлыки и назначайте их письмам для удобной
          организации.
        </p>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit} className="label-form">
          <div className="form-group">
            <label>Название</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Важное, Работа, Личное…"
              required
            />
          </div>
          <div className="form-group">
            <label>Цвет</label>
            <div className="color-picker">
              {LABEL_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-swatch ${color === c ? "selected" : ""}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                  title={c}
                />
              ))}
              <input
                type="color"
                className="color-input-native"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                title="Свой цвет"
              />
            </div>
          </div>
          <div className="form-actions" style={{ marginTop: 12 }}>
            {editingId && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={resetForm}
              >
                Отменить редактирование
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading
                ? "Сохранение…"
                : editingId
                  ? "Сохранить"
                  : "Создать ярлык"}
            </button>
          </div>
        </form>

        {labels.length > 0 && (
          <div className="label-manager-list">
            <div className="sidebar-section-label">Ваши ярлыки</div>
            {labels.map((label) => (
              <div key={label.id} className="label-manager-item">
                <span
                  className="label-color-dot"
                  style={{ backgroundColor: label.color }}
                />
                <span className="label-manager-name">{label.name}</span>
                <div className="label-manager-actions">
                  <button
                    type="button"
                    className="label-action-btn"
                    onClick={() => handleEdit(label)}
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    className="label-action-btn label-action-danger"
                    onClick={() => handleDelete(label.id)}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="form-actions" style={{ marginTop: 24 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
