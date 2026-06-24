"use client";

import { useEffect, useRef, useState } from "react";
import { LabelBadgeList } from "@/components/LabelBadge";
import type { MailFolderId } from "@/lib/folders";
import type { MailLabel } from "@/lib/types";

interface EmailLabelPickerProps {
  accountId: string;
  folder: MailFolderId;
  uid: number;
  assigned: MailLabel[];
  allLabels: MailLabel[];
  onChange: (labels: MailLabel[]) => void;
  onManageLabels: () => void;
}

export function EmailLabelPicker({
  accountId,
  folder,
  uid,
  assigned,
  allLabels,
  onChange,
  onManageLabels,
}: EmailLabelPickerProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleLabel = async (label: MailLabel) => {
    const isAssigned = assigned.some((l) => l.id === label.id);
    setLoading(true);
    try {
      const res = await fetch("/api/emails/labels", {
        method: isAssigned ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          folder,
          uid,
          labelId: label.id,
        }),
      });
      if (!res.ok) return;
      if (isAssigned) {
        onChange(assigned.filter((l) => l.id !== label.id));
      } else {
        onChange([...assigned, label]);
      }
    } finally {
      setLoading(false);
    }
  };

  const removeLabel = async (labelId: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/emails/labels", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, folder, uid, labelId }),
      });
      if (res.ok) {
        onChange(assigned.filter((l) => l.id !== labelId));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="email-label-picker" ref={ref}>
      <LabelBadgeList labels={assigned} onRemove={removeLabel} />

      <div className="label-picker-anchor">
        <button
          type="button"
          className="toolbar-btn"
          onClick={() => setOpen((v) => !v)}
          disabled={loading}
        >
          🏷 Ярлык
        </button>

        {open && (
          <div className="label-picker-dropdown">
            {allLabels.length === 0 ? (
              <p className="label-picker-empty">
                Нет ярлыков.{" "}
                <button type="button" className="link-btn" onClick={onManageLabels}>
                  Создать
                </button>
              </p>
            ) : (
              allLabels.map((label) => {
                const checked = assigned.some((l) => l.id === label.id);
                return (
                  <button
                    key={label.id}
                    type="button"
                    className={`label-picker-option ${checked ? "checked" : ""}`}
                    onClick={() => toggleLabel(label)}
                    disabled={loading}
                  >
                    <span
                      className="label-color-dot"
                      style={{ backgroundColor: label.color }}
                    />
                    <span>{label.name}</span>
                    {checked && <span className="label-check">✓</span>}
                  </button>
                );
              })
            )}
            <button
              type="button"
              className="label-picker-manage"
              onClick={() => {
                setOpen(false);
                onManageLabels();
              }}
            >
              Управление ярлыками…
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
