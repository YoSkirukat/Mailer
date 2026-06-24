"use client";

import { useEffect, useRef, useState } from "react";
import type { MailFolderId } from "@/lib/folders";
import type { EmailSummary, MailLabel } from "@/lib/types";

export type ContextMenuAction =
  | "open"
  | "reply"
  | "markUnread"
  | "delete"
  | "archive"
  | "spam"
  | "toggleLabel"
  | "manageLabels";

interface EmailContextMenuProps {
  email: EmailSummary;
  folder: MailFolderId;
  labels: MailLabel[];
  x: number;
  y: number;
  onAction: (action: ContextMenuAction, labelId?: string) => void;
  onClose: () => void;
}

export function EmailContextMenu({
  email,
  folder,
  labels,
  x,
  y,
  onAction,
  onClose,
}: EmailContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [labelSubmenuOpen, setLabelSubmenuOpen] = useState(false);
  const [pos, setPos] = useState({ x, y });
  const submenuCloseTimer = useRef<number | null>(null);

  const openLabelSubmenu = () => {
    if (submenuCloseTimer.current !== null) {
      window.clearTimeout(submenuCloseTimer.current);
      submenuCloseTimer.current = null;
    }
    setLabelSubmenuOpen(true);
  };

  const scheduleCloseLabelSubmenu = () => {
    if (submenuCloseTimer.current !== null) {
      window.clearTimeout(submenuCloseTimer.current);
    }
    submenuCloseTimer.current = window.setTimeout(() => {
      submenuCloseTimer.current = null;
      setLabelSubmenuOpen(false);
    }, 220);
  };

  useEffect(() => {
    return () => {
      if (submenuCloseTimer.current !== null) {
        window.clearTimeout(submenuCloseTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const padding = 8;
    let nx = x;
    let ny = y;
    if (x + rect.width > window.innerWidth - padding) {
      nx = window.innerWidth - rect.width - padding;
    }
    if (y + rect.height > window.innerHeight - padding) {
      ny = window.innerHeight - rect.height - padding;
    }
    setPos({ x: Math.max(padding, nx), y: Math.max(padding, ny) });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onScroll = () => onClose();
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  const assignedIds = new Set((email.labels ?? []).map((l) => l.id));

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className="context-menu-item"
        onClick={() => onAction("open")}
      >
        Открыть письмо
      </button>
      <button
        type="button"
        className="context-menu-item"
        onClick={() => onAction("reply")}
      >
        Ответить
      </button>
      <button
        type="button"
        className="context-menu-item"
        onClick={() => onAction("markUnread")}
        disabled={!email.seen}
      >
        Пометить непрочитанным
      </button>
      <div className="context-menu-sep" />
      <button
        type="button"
        className="context-menu-item context-menu-item-danger"
        onClick={() => onAction("delete")}
      >
        Удалить
      </button>
      <button
        type="button"
        className="context-menu-item"
        onClick={() => onAction("archive")}
        disabled={folder === "archive"}
      >
        В архив
      </button>
      <button
        type="button"
        className="context-menu-item"
        onClick={() => onAction("spam")}
        disabled={folder === "spam"}
      >
        В спам
      </button>
      <div className="context-menu-sep" />
      <div
        className="context-menu-submenu-wrap"
        onMouseEnter={openLabelSubmenu}
        onMouseLeave={scheduleCloseLabelSubmenu}
      >
        <button
          type="button"
          className={`context-menu-item context-menu-item-has-sub ${labelSubmenuOpen ? "open" : ""}`}
          onClick={() => setLabelSubmenuOpen((value) => !value)}
        >
          Ярлык
          <span className="context-menu-arrow">›</span>
        </button>
        {labelSubmenuOpen && (
          <div
            className="context-submenu"
            onMouseEnter={openLabelSubmenu}
            onMouseLeave={scheduleCloseLabelSubmenu}
          >
            <div className="context-submenu-panel">
            {labels.length === 0 ? (
              <button
                type="button"
                className="context-menu-item context-menu-item-muted"
                onClick={() => onAction("manageLabels")}
              >
                Создать ярлык…
              </button>
            ) : (
              labels.map((label) => {
                const checked = assignedIds.has(label.id);
                return (
                  <button
                    key={label.id}
                    type="button"
                    className={`context-menu-item ${checked ? "checked" : ""}`}
                    onClick={() => onAction("toggleLabel", label.id)}
                  >
                    <span
                      className="label-color-dot"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="context-label-name">{label.name}</span>
                    {checked && <span className="label-check">✓</span>}
                  </button>
                );
              })
            )}
            {labels.length > 0 && (
              <>
                <div className="context-menu-sep" />
                <button
                  type="button"
                  className="context-menu-item context-menu-item-muted"
                  onClick={() => onAction("manageLabels")}
                >
                  Управление ярлыками…
                </button>
              </>
            )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
