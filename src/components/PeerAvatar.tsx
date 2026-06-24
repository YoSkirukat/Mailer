import { parseEmailAddress } from "@/lib/email-utils";
import {
  getPeerAvatarInitial,
  getPeerAvatarStyle,
  getPrimaryPeerAddress,
} from "@/lib/peer-avatar";

interface PeerAvatarProps {
  address: string;
  className?: string;
  size?: "list" | "menu";
}

export function PeerAvatar({
  address,
  className = "",
  size = "list",
}: PeerAvatarProps) {
  const primary = getPrimaryPeerAddress(address);
  const { name, email } = parseEmailAddress(primary);
  const initial = getPeerAvatarInitial(name, email);
  const style = getPeerAvatarStyle(email);

  return (
    <span
      className={`peer-avatar peer-avatar--${size}${className ? ` ${className}` : ""}`}
      style={style}
      aria-hidden
    >
      {initial}
    </span>
  );
}
