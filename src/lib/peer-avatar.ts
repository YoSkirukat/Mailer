const AVATAR_BACKGROUNDS = [
  "#fce7f3",
  "#dbeafe",
  "#dcfce7",
  "#fef3c7",
  "#ede9fe",
  "#ffedd5",
  "#e0f2fe",
];

const AVATAR_FOREGROUNDS = [
  "#be185d",
  "#1d4ed8",
  "#15803d",
  "#b45309",
  "#6d28d9",
  "#c2410c",
  "#0369a1",
];

export function getPrimaryPeerAddress(value: string): string {
  return value.split(/,\s*/)[0]?.trim() || value;
}

export function getPeerAvatarStyle(email: string): {
  backgroundColor: string;
  color: string;
} {
  let hash = 0;
  for (const char of email) hash = (hash + char.charCodeAt(0)) | 0;
  const index = Math.abs(hash) % AVATAR_BACKGROUNDS.length;
  return {
    backgroundColor: AVATAR_BACKGROUNDS[index],
    color: AVATAR_FOREGROUNDS[index],
  };
}

export function getPeerAvatarInitial(name: string, email: string): string {
  const letter = (name || email).trim().charAt(0).toUpperCase();
  return letter || "?";
}
