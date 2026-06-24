"use client";

import { useEffect, useRef, useState } from "react";
import { PeerAvatar } from "@/components/PeerAvatar";
import { parseEmailAddress } from "@/lib/email-utils";

const iconStroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function CopyIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden>
      <rect {...iconStroke} x="9" y="9" width="13" height="13" rx="2" />
      <path {...iconStroke} d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function ComposeIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden>
      <path {...iconStroke} d="M12 20h9" />
      <path {...iconStroke} d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden>
      <circle {...iconStroke} cx="11" cy="11" r="7" />
      <line {...iconStroke} x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  );
}

function ContactIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden>
      <path {...iconStroke} d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle {...iconStroke} cx="9" cy="7" r="4" />
      <line {...iconStroke} x1="19" y1="8" x2="19" y2="14" />
      <line {...iconStroke} x1="16" y1="11" x2="22" y2="11" />
    </svg>
  );
}

interface SenderAddressMenuProps {
  address: string;
  onCompose: (email: string) => void;
  onSearch: (email: string) => void;
}

export function SenderAddressMenu({
  address,
  onCompose,
  onSearch,
}: SenderAddressMenuProps) {
  const { name, email } = parseEmailAddress(address);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [contactState, setContactState] = useState<
    "idle" | "loading" | "done" | "exists"
  >("idle");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCopied(false);
    setContactState("idle");
    setOpen(false);
  }, [address]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const handleAddContact = async () => {
    setContactState("loading");
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setContactState("idle");
        return;
      }
      setContactState(data.created ? "done" : "exists");
    } catch {
      setContactState("idle");
    }
  };

  return (
    <div className="sender-address-menu" ref={ref}>
      <button
        type="button"
        className="sender-address-link"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {address}
      </button>

      {open && (
        <div className="sender-address-dropdown" role="menu">
          <div className="sender-address-dropdown-header">
            <PeerAvatar address={address} size="menu" />
            <div className="sender-address-info">
              <div className="sender-address-name">{name}</div>
              <div className="sender-address-email">{email}</div>
            </div>
          </div>

          <div className="sender-address-dropdown-divider" />

          <button
            type="button"
            className="sender-address-dropdown-item"
            role="menuitem"
            onClick={handleCopy}
          >
            <CopyIcon />
            <span>{copied ? "Адрес скопирован" : "Копировать адрес"}</span>
          </button>
          <button
            type="button"
            className="sender-address-dropdown-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onCompose(email);
            }}
          >
            <ComposeIcon />
            <span>Написать письмо</span>
          </button>
          <button
            type="button"
            className="sender-address-dropdown-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSearch(email);
            }}
          >
            <SearchIcon />
            <span>Найти все письма</span>
          </button>
          <button
            type="button"
            className="sender-address-dropdown-item"
            role="menuitem"
            onClick={handleAddContact}
            disabled={contactState === "loading" || contactState === "done"}
          >
            <ContactIcon />
            <span>
              {contactState === "loading"
                ? "Добавление…"
                : contactState === "done"
                  ? "Добавлен в контакты"
                  : contactState === "exists"
                    ? "Уже в контактах"
                    : "Добавить в контакты"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
