"use client";

import { useEffect, useRef } from "react";
import { getFaviconUrls } from "@/lib/favicon";

const MANAGED_FAVICON_ID = "mailer-managed-favicon";

function takeOverFavicon(): HTMLLinkElement {
  const existing = document.getElementById(
    MANAGED_FAVICON_ID
  ) as HTMLLinkElement | null;
  if (existing) return existing;

  document
    .querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')
    .forEach((node) => node.remove());

  const link = document.createElement("link");
  link.id = MANAGED_FAVICON_ID;
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
    const link = takeOverFavicon();
    linkRef.current = link;
    link.href = getFaviconUrls().on;
  }, []);

  useEffect(() => {
    document.title =
      unreadCount > 0 ? `(${unreadCount}) ${folderName}` : folderName;
  }, [folderName, unreadCount]);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const link = linkRef.current;
    if (!link) return;

    const { on, off } = getFaviconUrls();

    if (unreadCount <= 0) {
      if (link.href !== on) link.href = on;
      return;
    }

    let bright = true;
    if (link.href !== on) link.href = on;

    timerRef.current = window.setInterval(() => {
      bright = !bright;
      const next = bright ? on : off;
      if (linkRef.current && linkRef.current.href !== next) {
        linkRef.current.href = next;
      }
    }, 1000);

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (linkRef.current && linkRef.current.href !== on) {
        linkRef.current.href = on;
      }
    };
  }, [unreadCount]);

  return null;
}
