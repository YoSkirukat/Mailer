"use client";

import { useEffect, useRef } from "react";

function buildFaviconDataUrl(bright: boolean): string {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const bg = bright ? "#4f8cff" : "#b8d4ff";
  const stroke = bright ? "#ffffff" : "rgba(255,255,255,0.55)";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 32, 32);

  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.75;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeRect(6.5, 9.5, 19, 13);

  ctx.beginPath();
  ctx.moveTo(6, 11);
  ctx.lineTo(16, 18);
  ctx.lineTo(26, 11);
  ctx.stroke();

  return canvas.toDataURL("image/png");
}

let faviconOn = "";
let faviconOff = "";

function getFaviconUrls() {
  if (!faviconOn) {
    faviconOn = buildFaviconDataUrl(true);
    faviconOff = buildFaviconDataUrl(false);
  }
  return { on: faviconOn, off: faviconOff };
}

function ensureManagedFavicon(): HTMLLinkElement {
  document
    .querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')
    .forEach((node) => node.remove());

  const existing = document.getElementById(
    "mailer-managed-favicon"
  ) as HTMLLinkElement | null;
  if (existing) return existing;

  const link = document.createElement("link");
  link.id = "mailer-managed-favicon";
  link.rel = "icon";
  link.type = "image/png";
  document.head.appendChild(link);
  return link;
}

interface TabTitleProps {
  folderName: string;
  unreadCount: number;
}

export function TabTitle({ folderName, unreadCount }: TabTitleProps) {
  const linkRef = useRef<HTMLLinkElement | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    document.title =
      unreadCount > 0 ? `(${unreadCount}) ${folderName}` : folderName;

    const { on, off } = getFaviconUrls();
    const link = linkRef.current ?? ensureManagedFavicon();
    linkRef.current = link;
    link.href = on;

    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (unreadCount <= 0) {
      return;
    }

    let bright = true;
    timerRef.current = window.setInterval(() => {
      bright = !bright;
      if (linkRef.current) {
        linkRef.current.href = bright ? on : off;
      }
    }, 1000);

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (linkRef.current) {
        linkRef.current.href = on;
      }
    };
  }, [folderName, unreadCount]);

  return null;
}
