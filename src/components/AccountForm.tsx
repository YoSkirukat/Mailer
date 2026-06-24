"use client";

import { useState } from "react";
import { PROVIDER_PRESETS } from "@/lib/types";

interface AccountFormProps {
  onClose?: () => void;
  onCancel?: () => void;
  onSuccess: () => void;
  embedded?: boolean;
}

export function AccountForm({
  onClose,
  onCancel,
  onSuccess,
  embedded = false,
}: AccountFormProps) {
  const [provider, setProvider] = useState("yandex");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [imapHost, setImapHost] = useState("imap.yandex.ru");
  const [imapPort, setImapPort] = useState(993);
  const [smtpHost, setSmtpHost] = useState("smtp.yandex.ru");
  const [smtpPort, setSmtpPort] = useState(465);
  const [ignoreTlsErrors, setIgnoreTlsErrors] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleProviderChange = (id: string) => {
    setProvider(id);
    const preset = PROVIDER_PRESETS.find((p) => p.id === id);
    if (preset && id !== "custom") {
      setImapHost(preset.imapHost);
      setImapPort(preset.imapPort);
      setSmtpHost(preset.smtpHost);
      setSmtpPort(preset.smtpPort);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || email.split("@")[0],
          email,
          password,
          imapHost,
          imapPort: Number(imapPort),
          smtpHost,
          smtpPort: Number(smtpPort),
          ignoreTlsErrors,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка при добавлении");
        return;
      }
      onSuccess();
    } catch {
      setError("Не удалось подключиться к серверу");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (onCancel) onCancel();
    else onClose?.();
  };

  const form = (
    <>
      {!embedded && <h2>Добавить почтовый ящик</h2>}

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Провайдер</label>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value)}
            >
              {PROVIDER_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Название (отображаемое имя)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Рабочая почта"
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label>Пароль / пароль приложения</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {(provider === "custom" || provider === "gmail") && (
            <>
              <div className="form-group">
                <label>IMAP сервер</label>
                <div className="form-row">
                  <input
                    value={imapHost}
                    onChange={(e) => setImapHost(e.target.value)}
                    required
                  />
                  <input
                    type="number"
                    value={imapPort}
                    onChange={(e) => setImapPort(Number(e.target.value))}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label>SMTP сервер</label>
                <div className="form-row">
                  <input
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    required
                  />
                  <input
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(Number(e.target.value))}
                    required
                  />
                </div>
              </div>
            </>
          )}

          {provider === "custom" && (
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                fontSize: "0.85rem",
                color: "var(--text-muted)",
                marginBottom: 16,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={ignoreTlsErrors}
                onChange={(e) => setIgnoreTlsErrors(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>
                Игнорировать ошибки сертификата (просроченный или
                самоподписанный TLS на корпоративном сервере)
              </span>
            </label>
          )}

          {provider === "gmail" && (
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Для Gmail используйте пароль приложения (не обычный пароль).
              Создайте его в настройках Google-аккаунта → Безопасность.
            </p>
          )}

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
            >
              {embedded ? "Назад" : "Отмена"}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? "Подключение…" : "Добавить"}
            </button>
          </div>
        </form>
    </>
  );

  if (embedded) {
    return form;
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {form}
      </div>
    </div>
  );
}
