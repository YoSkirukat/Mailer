import type { MailLabel } from "@/lib/types";

interface LabelBadgeProps {
  label: MailLabel;
  onRemove?: () => void;
  small?: boolean;
}

export function LabelBadge({ label, onRemove, small }: LabelBadgeProps) {
  return (
    <span
      className={`label-badge ${small ? "label-badge-sm" : ""}`}
      style={{ backgroundColor: label.color }}
      title={label.name}
    >
      <span className="label-badge-text">{label.name}</span>
      {onRemove && (
        <button
          type="button"
          className="label-badge-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Убрать ярлык ${label.name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

interface LabelBadgeListProps {
  labels: MailLabel[];
  onRemove?: (labelId: string) => void;
  small?: boolean;
}

export function LabelBadgeList({
  labels,
  onRemove,
  small,
}: LabelBadgeListProps) {
  if (!labels.length) return null;
  return (
    <span className="label-badge-list">
      {labels.map((label) => (
        <LabelBadge
          key={label.id}
          label={label}
          small={small}
          onRemove={onRemove ? () => onRemove(label.id) : undefined}
        />
      ))}
    </span>
  );
}
