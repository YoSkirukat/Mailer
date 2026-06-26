import type {
  FilterActionType,
  FilterMatchMode,
  FilterRuleField,
  FilterRuleOperator,
} from "./types";
import type { MailFolderId } from "./folders";
import { MAIL_FOLDERS } from "./folders";

export const FILTER_MATCH_MODE_OPTIONS: {
  value: FilterMatchMode;
  label: string;
}[] = [
  { value: "all", label: "соответствует всем указанным правилам" },
  { value: "any", label: "соответствует любому из указанных правил" },
  { value: "all_messages", label: "все сообщения" },
];

export const FILTER_RULE_FIELD_OPTIONS: {
  value: FilterRuleField;
  label: string;
}[] = [
  { value: "from", label: "От" },
  { value: "to", label: "Кому" },
  { value: "subject", label: "Тема" },
  { value: "body", label: "Текст" },
];

export const FILTER_RULE_OPERATOR_OPTIONS: {
  value: FilterRuleOperator;
  label: string;
}[] = [
  { value: "contains", label: "содержит" },
  { value: "not_contains", label: "не содержит" },
  { value: "equals", label: "равно" },
];

export const FILTER_ACTION_OPTIONS: {
  value: FilterActionType;
  label: string;
}[] = [
  { value: "move_to", label: "Переместить сообщение в" },
  { value: "forward_to", label: "Отправить копию сообщения на" },
  { value: "mark_read", label: "Пометить прочитанным" },
  { value: "set_label", label: "Установить ярлык" },
  { value: "delete", label: "Удалить сообщение" },
];

export const FILTER_FOLDER_OPTIONS = MAIL_FOLDERS.map((folder) => ({
  value: folder.id as MailFolderId,
  label: folder.label,
}));

export function newRuleId(): string {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newActionId(): string {
  return `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
