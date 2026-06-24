"use client";

import { useId } from "react";

export type MailerLogoStyle = "badge" | "flow";

interface MailerLogoProps {
  style?: MailerLogoStyle;
  variant?: "full" | "mark";
  height?: number;
  className?: string;
}

function BadgeMark({
  gradId,
  shineId,
  size,
  className,
}: {
  gradId: string;
  shineId: string;
  size: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient
          id={gradId}
          x1="4"
          y1="2"
          x2="28"
          y2="30"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#6BA8FF" />
          <stop stopColor="#3B82F6" offset="0.55" />
          <stop stopColor="#2563EB" offset="1" />
        </linearGradient>
        <linearGradient
          id={shineId}
          x1="6"
          y1="4"
          x2="22"
          y2="20"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#ffffff" stopOpacity="0.45" />
          <stop stopColor="#ffffff" stopOpacity="0" offset="1" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradId})`} />
      <rect width="32" height="32" rx="9" fill={`url(#${shineId})`} />
      <rect
        x="8"
        y="10"
        width="16"
        height="12"
        rx="2"
        stroke="#ffffff"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 12.2L16 18.2L24 12.2"
        stroke="#ffffff"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FlowMark({
  gradId,
  glowId,
  size,
  className,
}: {
  gradId: string;
  glowId: string;
  size: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient
          id={gradId}
          x1="6"
          y1="4"
          x2="26"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#818CF8" />
          <stop stopColor="#3B82F6" offset="0.55" />
          <stop stopColor="#06B6D4" offset="1" />
        </linearGradient>
        <radialGradient
          id={glowId}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(16 16) scale(14)"
        >
          <stop stopColor="#818CF8" stopOpacity="0.22" />
          <stop stopColor="#3B82F6" stopOpacity="0" offset="1" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill={`url(#${glowId})`} />
      <rect
        x="8.5"
        y="11"
        width="15"
        height="11"
        rx="2"
        stroke={`url(#${gradId})`}
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 12.75L16 18.25L23.5 12.75"
        stroke={`url(#${gradId})`}
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23" cy="10" r="2.25" fill={`url(#${gradId})`} />
    </svg>
  );
}

function BadgeFull({
  gradId,
  shineId,
  height,
  className,
}: {
  gradId: string;
  shineId: string;
  height: number;
  className?: string;
}) {
  const width = Math.round(height * (118 / 28));

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 118 28"
      fill="none"
      className={className}
      role="img"
      aria-label="Mailer"
    >
      <defs>
        <linearGradient
          id={gradId}
          x1="2"
          y1="0"
          x2="26"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#6BA8FF" />
          <stop stopColor="#3B82F6" offset="0.55" />
          <stop stopColor="#2563EB" offset="1" />
        </linearGradient>
        <linearGradient
          id={shineId}
          x1="4"
          y1="2"
          x2="20"
          y2="18"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#ffffff" stopOpacity="0.45" />
          <stop stopColor="#ffffff" stopOpacity="0" offset="1" />
        </linearGradient>
      </defs>
      <rect width="28" height="28" rx="8" fill={`url(#${gradId})`} />
      <rect width="28" height="28" rx="8" fill={`url(#${shineId})`} />
      <rect
        x="7"
        y="9"
        width="14"
        height="10"
        rx="1.75"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 10.75L14 15.75L21 10.75"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x="36"
        y="20.5"
        fill="currentColor"
        fontFamily="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize="17.5"
        fontWeight="700"
        letterSpacing="-0.6"
      >
        <tspan>Mail</tspan>
        <tspan fill="var(--accent, #3B82F6)">er</tspan>
      </text>
    </svg>
  );
}

function FlowFull({
  gradId,
  glowId,
  height,
  className,
}: {
  gradId: string;
  glowId: string;
  height: number;
  className?: string;
}) {
  const width = Math.round(height * (126 / 28));

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 126 28"
      fill="none"
      className={className}
      role="img"
      aria-label="Mailer"
    >
      <defs>
        <linearGradient
          id={gradId}
          x1="4"
          y1="2"
          x2="28"
          y2="26"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#818CF8" />
          <stop stopColor="#3B82F6" offset="0.55" />
          <stop stopColor="#06B6D4" offset="1" />
        </linearGradient>
        <radialGradient
          id={glowId}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(14 14) scale(13)"
        >
          <stop stopColor="#818CF8" stopOpacity="0.2" />
          <stop stopColor="#3B82F6" stopOpacity="0" offset="1" />
        </radialGradient>
      </defs>
      <circle cx="14" cy="14" r="13" fill={`url(#${glowId})`} />
      <rect
        x="6.5"
        y="9"
        width="15"
        height="11"
        rx="2"
        stroke={`url(#${gradId})`}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 10.75L14 16.25L21.5 10.75"
        stroke={`url(#${gradId})`}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="21.5" cy="8" r="2" fill={`url(#${gradId})`} />
      <text
        x="34"
        y="19.5"
        fill="currentColor"
        fontFamily="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize="18"
        fontWeight="600"
        letterSpacing="-0.3"
      >
        mailer
      </text>
      <path
        d="M34 22.5C48 24.5 68 24.5 88 22"
        stroke={`url(#${gradId})`}
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.75"
      />
    </svg>
  );
}

export function MailerLogo({
  style = "flow",
  variant = "full",
  height = 28,
  className,
}: MailerLogoProps) {
  const uid = useId().replace(/:/g, "");
  const gradId = `mailer-grad-${uid}`;
  const shineId = `mailer-shine-${uid}`;
  const glowId = `mailer-glow-${uid}`;

  if (style === "badge") {
    if (variant === "mark") {
      return (
        <BadgeMark
          gradId={gradId}
          shineId={shineId}
          size={height}
          className={className}
        />
      );
    }
    return (
      <BadgeFull
        gradId={gradId}
        shineId={shineId}
        height={height}
        className={className}
      />
    );
  }

  if (variant === "mark") {
    return (
      <FlowMark
        gradId={gradId}
        glowId={glowId}
        size={height}
        className={className}
      />
    );
  }

  return (
    <FlowFull
      gradId={gradId}
      glowId={glowId}
      height={height}
      className={className}
    />
  );
}
