export interface MailLabel {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface MailLabelInput {
  name: string;
  color: string;
}

export interface MailTemplate {
  id: string;
  name: string;
  subject: string;
  html: string;
  createdAt: string;
  updatedAt: string;
}

export interface MailTemplateInput {
  name: string;
  subject?: string;
  html: string;
}

export type FilterMatchMode = "all" | "any" | "all_messages";

export type FilterRuleField = "from" | "to" | "subject" | "body";

export type FilterRuleOperator = "contains" | "not_contains" | "equals";

export type FilterActionType =
  | "move_to"
  | "delete"
  | "mark_read"
  | "forward_to"
  | "set_label";

export interface MailFilterRule {
  id: string;
  field: FilterRuleField;
  operator: FilterRuleOperator;
  value: string;
}

export interface MailFilterAction {
  id: string;
  type: FilterActionType;
  value: string;
}

export interface MailFilter {
  id: string;
  name: string;
  enabled: boolean;
  baselinePending: boolean;
  matchMode: FilterMatchMode;
  rules: MailFilterRule[];
  actions: MailFilterAction[];
  createdAt: string;
  updatedAt: string;
}

export interface MailFilterInput {
  name: string;
  enabled: boolean;
  matchMode: FilterMatchMode;
  rules: Omit<MailFilterRule, "id">[];
  actions: Omit<MailFilterAction, "id">[];
}

export interface MailAccount {
  id: string;
  name: string;
  fromName: string;
  email: string;
  color: string;
  signature: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  ignoreTlsErrors: boolean;
  createdAt: string;
}

export interface MailAccountUpdate {
  name?: string;
  fromName?: string;
  color?: string;
  signature?: string;
}

export interface MailAccountInput {
  name: string;
  email: string;
  password: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  ignoreTlsErrors?: boolean;
}

export interface EmailSummary {
  uid: number;
  accountId: string;
  accountEmail: string;
  accountName: string;
  subject: string;
  from: string;
  to?: string;
  date: string;
  seen: boolean;
  answered?: boolean;
  hasAttachments?: boolean;
  attachments?: EmailAttachment[];
  snippet: string;
  folder?: string;
  accountColor?: string;
  labels?: MailLabel[];
}

export interface EmailAttachment {
  partId: string;
  filename: string;
  contentType: string;
  size?: number;
}

export interface EmailDetail extends EmailSummary {
  to: string;
  cc?: string;
  replyToHeader?: string;
  originalFromHeader?: string;
  text?: string;
  html?: string;
}

export interface ProviderPreset {
  id: string;
  label: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "gmail",
    label: "Gmail",
    imapHost: "imap.gmail.com",
    imapPort: 993,
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
  },
  {
    id: "yandex",
    label: "Яндекс",
    imapHost: "imap.yandex.ru",
    imapPort: 993,
    smtpHost: "smtp.yandex.ru",
    smtpPort: 465,
  },
  {
    id: "mailru",
    label: "Mail.ru",
    imapHost: "imap.mail.ru",
    imapPort: 993,
    smtpHost: "smtp.mail.ru",
    smtpPort: 465,
  },
  {
    id: "outlook",
    label: "Outlook / Office 365",
    imapHost: "outlook.office365.com",
    imapPort: 993,
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
  },
  {
    id: "custom",
    label: "Другой (вручную)",
    imapHost: "",
    imapPort: 993,
    smtpHost: "",
    smtpPort: 587,
  },
];
