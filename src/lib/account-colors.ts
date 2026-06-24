import { LABEL_COLORS } from "./label-colors";

export const DEFAULT_ACCOUNT_COLOR = LABEL_COLORS[5];

export function pickAccountColor(index: number): string {
  return LABEL_COLORS[index % LABEL_COLORS.length];
}
