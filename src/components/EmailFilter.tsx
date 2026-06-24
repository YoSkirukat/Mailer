"use client";

import { useEffect, useRef, useState } from "react";
import type { MailLabel } from "@/lib/types";

export type EmailListFilter = "all" | "unread" | "attachments" | "label";

interface EmailFilterProps {
  filter: EmailListFilter;
  filterLabelId: string | null;
  labels: MailLabel[];
  disabled?: boolean;
  onChange: (filter: EmailListFilter, labelId?: string | null) => void;
}

const FILTER_LABELS: Record<Exclude<EmailListFilter, "label">, string> = {
  all: "Все письма",
  unread: "Непрочитанные",
  attachments: "С вложениями",
};

function currentLabel(
  filter: EmailListFilter,
  filterLabelId: string | null,
  labels: MailLabel[]
): string {
  if (filter === "label" && filterLabelId) {
    const label = labels.find((l) => l.id === filterLabelId);
    return label ? `Ярлык: ${label.name}` : "Ярлык";
  }
  if (filter === "label") return "Ярлык";
  return FILTER_LABELS[filter];
}

export function EmailFilter({
  filter,
  filterLabelId,
  labels,
  disabled,
  onChange,
}: EmailFilterProps) {
  const [open, setOpen] = useState(false);
  const [labelMenuOpen, setLabelMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setLabelMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectFilter = (next: EmailListFilter, labelId?: string | null) => {
    onChange(next, labelId);
    setOpen(false);
    setLabelMenuOpen(false);
  };

  return (
    <div className="email-filter" ref={ref}>
      <button
        type="button"
        className={`email-filter-trigger ${filter !== "all" ? "active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{currentLabel(filter, filterLabelId, labels)}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="email-filter-menu" role="listbox">
          <button
            type="button"
            className={`email-filter-item ${filter === "all" ? "selected" : ""}`}
            onClick={() => selectFilter("all")}
          >
            Все письма
          </button>
          <button
            type="button"
            className={`email-filter-item ${filter === "unread" ? "selected" : ""}`}
            onClick={() => selectFilter("unread")}
          >
            Непрочитанные
          </button>
          <button
            type="button"
            className={`email-filter-item ${filter === "attachments" ? "selected" : ""}`}
            onClick={() => selectFilter("attachments")}
          >
            С вложениями
          </button>
          <div
            className="email-filter-submenu-wrap"
            onMouseEnter={() => setLabelMenuOpen(true)}
            onMouseLeave={() => setLabelMenuOpen(false)}
          >
            <button
              type="button"
              className={`email-filter-item email-filter-item-has-sub ${filter === "label" ? "selected" : ""} ${labelMenuOpen ? "open" : ""}`}
              onClick={() => setLabelMenuOpen((v) => !v)}
            >
              Ярлык
              <span className="email-filter-arrow">›</span>
            </button>
            {labelMenuOpen && (
              <div className="email-filter-submenu">
                {labels.length === 0 ? (
                  <span className="email-filter-empty">Нет ярлыков</span>
                ) : (
                  labels.map((label) => (
                    <button
                      key={label.id}
                      type="button"
                      className={`email-filter-item ${filter === "label" && filterLabelId === label.id ? "selected" : ""}`}
                      onClick={() => selectFilter("label", label.id)}
                    >
                      <span
                        className="label-color-dot"
                        style={{ backgroundColor: label.color }}
                      />
                      {label.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
