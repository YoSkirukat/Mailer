import type { MailFolderId } from "./folders";

interface IconProps {
  size?: number;
  className?: string;
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function FolderIcon({
  id,
  size = 18,
  className,
}: IconProps & { id: MailFolderId }) {
  const props = { width: size, height: size, viewBox: "0 0 24 24", className };

  switch (id) {
    case "inbox":
      return (
        <svg {...props} aria-hidden>
          <rect {...stroke} x="2" y="4" width="20" height="16" rx="2" />
          <polyline {...stroke} points="22,6 12,13 2,6" />
        </svg>
      );
    case "sent":
      return (
        <svg {...props} aria-hidden>
          <line {...stroke} x1="22" y1="2" x2="11" y2="13" />
          <polygon
            {...stroke}
            points="22 2 15 22 11 13 2 9 22 2"
          />
        </svg>
      );
    case "archive":
      return (
        <svg {...props} aria-hidden>
          <polyline {...stroke} points="21 8 21 21 3 21 3 8" />
          <rect {...stroke} x="1" y="3" width="22" height="5" rx="1" />
          <line {...stroke} x1="10" y1="12" x2="14" y2="12" />
        </svg>
      );
    case "spam":
      return (
        <svg {...props} aria-hidden>
          <path
            {...stroke}
            d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z"
          />
          <path
            {...stroke}
            d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"
          />
        </svg>
      );
    case "trash":
      return (
        <svg {...props} aria-hidden>
          <polyline {...stroke} points="3 6 5 6 21 6" />
          <path
            {...stroke}
            d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
          />
        </svg>
      );
    default:
      return null;
  }
}
