import { randomUUID } from "crypto";
import { getDatabase } from "./db";
import type { MailFolderId } from "./folders";
import { isValidFolderId } from "./folders";
import type {
  FilterActionType,
  FilterMatchMode,
  FilterRuleField,
  FilterRuleOperator,
  MailFilter,
  MailFilterAction,
  MailFilterInput,
  MailFilterRule,
} from "./types";

const MATCH_MODES: FilterMatchMode[] = ["all", "any", "all_messages"];
const RULE_FIELDS: FilterRuleField[] = ["from", "to", "subject", "body"];
const RULE_OPERATORS: FilterRuleOperator[] = [
  "contains",
  "not_contains",
  "equals",
];
const ACTION_TYPES: FilterActionType[] = [
  "move_to",
  "delete",
  "mark_read",
  "forward_to",
  "set_label",
];

function rowToFilter(
  row: Record<string, unknown>,
  rules: MailFilterRule[],
  actions: MailFilterAction[]
): MailFilter {
  return {
    id: row.id as string,
    name: row.name as string,
    enabled: Boolean(row.enabled),
    baselinePending: Boolean(row.baseline_pending),
    matchMode: row.match_mode as FilterMatchMode,
    rules,
    actions,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function loadRules(filterId: string): MailFilterRule[] {
  const rows = getDatabase()
    .prepare(
      "SELECT * FROM mail_filter_rules WHERE filter_id = ? ORDER BY sort_order ASC"
    )
    .all(filterId) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: row.id as string,
    field: row.field as FilterRuleField,
    operator: row.operator as FilterRuleOperator,
    value: row.value as string,
  }));
}

function loadActions(filterId: string): MailFilterAction[] {
  const rows = getDatabase()
    .prepare(
      "SELECT * FROM mail_filter_actions WHERE filter_id = ? ORDER BY sort_order ASC"
    )
    .all(filterId) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: row.id as string,
    type: row.action_type as FilterActionType,
    value: row.value as string,
  }));
}

function getFilterById(id: string): MailFilter | null {
  const row = getDatabase()
    .prepare("SELECT * FROM mail_filters WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToFilter(row, loadRules(id), loadActions(id));
}

function validateFilterInput(input: MailFilterInput): void {
  const name = input.name.trim();
  if (!name) throw new Error("Укажите название фильтра");
  if (!MATCH_MODES.includes(input.matchMode)) {
    throw new Error("Некорректная область применения");
  }
  if (input.matchMode !== "all_messages" && input.rules.length === 0) {
    throw new Error("Добавьте хотя бы одно правило");
  }
  if (input.actions.length === 0) {
    throw new Error("Добавьте хотя бы одно действие");
  }

  for (const rule of input.rules) {
    if (!RULE_FIELDS.includes(rule.field)) {
      throw new Error("Некорректное поле правила");
    }
    if (!RULE_OPERATORS.includes(rule.operator)) {
      throw new Error("Некорректный оператор правила");
    }
    if (input.matchMode !== "all_messages" && !rule.value.trim()) {
      throw new Error("Заполните значение для каждого правила");
    }
  }

  for (const action of input.actions) {
    if (!ACTION_TYPES.includes(action.type)) {
      throw new Error("Некорректный тип действия");
    }
    if (action.type === "move_to") {
      if (!isValidFolderId(action.value)) {
        throw new Error("Выберите папку для перемещения");
      }
    }
    if (action.type === "forward_to") {
      const email = action.value.trim();
      if (!email || !email.includes("@")) {
        throw new Error("Укажите корректный email для пересылки");
      }
    }
    if (action.type === "set_label") {
      const labelId = action.value.trim();
      if (!labelId) {
        throw new Error("Выберите ярлык");
      }
      const label = getDatabase()
        .prepare("SELECT id FROM labels WHERE id = ?")
        .get(labelId);
      if (!label) {
        throw new Error("Ярлык не найден");
      }
    }
  }
}

function insertRules(filterId: string, rules: MailFilterInput["rules"]): void {
  const stmt = getDatabase().prepare(
    "INSERT INTO mail_filter_rules (id, filter_id, field, operator, value, sort_order) VALUES (?, ?, ?, ?, ?, ?)"
  );
  rules.forEach((rule, index) => {
    stmt.run(
      randomUUID(),
      filterId,
      rule.field,
      rule.operator,
      rule.value.trim(),
      index
    );
  });
}

function insertActions(
  filterId: string,
  actions: MailFilterInput["actions"]
): void {
  const stmt = getDatabase().prepare(
    "INSERT INTO mail_filter_actions (id, filter_id, action_type, value, sort_order) VALUES (?, ?, ?, ?, ?)"
  );
  actions.forEach((action, index) => {
    const value =
      action.type === "forward_to"
        ? action.value.trim().toLowerCase()
        : action.value.trim();
    stmt.run(randomUUID(), filterId, action.type, value, index);
  });
}

export function listMailFilters(): MailFilter[] {
  const rows = getDatabase()
    .prepare("SELECT * FROM mail_filters ORDER BY sort_order ASC, created_at ASC")
    .all() as Record<string, unknown>[];
  return rows.map((row) =>
    rowToFilter(
      row,
      loadRules(row.id as string),
      loadActions(row.id as string)
    )
  );
}

export function listEnabledMailFilters(): MailFilter[] {
  return listMailFilters().filter(
    (filter) => filter.enabled && !filter.baselinePending
  );
}

export function setMailFilterBaselinePending(
  id: string,
  pending: boolean
): MailFilter | null {
  const existing = getFilterById(id);
  if (!existing) return null;

  getDatabase()
    .prepare("UPDATE mail_filters SET baseline_pending = ? WHERE id = ?")
    .run(pending ? 1 : 0, id);

  return getFilterById(id);
}

export function createMailFilter(input: MailFilterInput): MailFilter {
  validateFilterInput(input);
  const id = randomUUID();
  const now = new Date().toISOString();
  const sortOrder = (
    getDatabase()
      .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM mail_filters")
      .get() as { next: number }
  ).next;

  getDatabase()
    .prepare(
      "INSERT INTO mail_filters (id, name, enabled, match_mode, sort_order, baseline_pending, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)"
    )
    .run(
      id,
      input.name.trim(),
      input.enabled ? 1 : 0,
      input.matchMode,
      sortOrder,
      now,
      now
    );

  insertRules(id, input.rules);
  insertActions(id, input.actions);

  return getFilterById(id)!;
}

export function updateMailFilter(
  id: string,
  input: MailFilterInput
): MailFilter | null {
  const existing = getFilterById(id);
  if (!existing) return null;

  validateFilterInput(input);
  const now = new Date().toISOString();
  const db = getDatabase();

  db.prepare(
    "UPDATE mail_filters SET name = ?, enabled = ?, match_mode = ?, baseline_pending = 1, updated_at = ? WHERE id = ?"
  ).run(input.name.trim(), input.enabled ? 1 : 0, input.matchMode, now, id);

  db.prepare("DELETE FROM mail_filter_rules WHERE filter_id = ?").run(id);
  db.prepare("DELETE FROM mail_filter_actions WHERE filter_id = ?").run(id);
  insertRules(id, input.rules);
  insertActions(id, input.actions);

  return getFilterById(id);
}

export function setMailFilterEnabled(
  id: string,
  enabled: boolean
): MailFilter | null {
  const existing = getFilterById(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      "UPDATE mail_filters SET enabled = ?, updated_at = ? WHERE id = ?"
    )
    .run(enabled ? 1 : 0, now, id);

  return getFilterById(id);
}

export function deleteMailFilter(id: string): boolean {
  const db = getDatabase();
  db.prepare("DELETE FROM mail_filter_applied_log WHERE filter_id = ?").run(id);
  db.prepare("DELETE FROM mail_filter_forward_log WHERE filter_id = ?").run(id);
  const result = db.prepare("DELETE FROM mail_filters WHERE id = ?").run(id);
  return result.changes > 0;
}

export function folderIdFromActionValue(value: string): MailFolderId | null {
  return isValidFolderId(value) ? value : null;
}

export function wasFilterApplied(
  filterId: string,
  accountId: string,
  folder: string,
  uid: number
): boolean {
  const row = getDatabase()
    .prepare(
      `SELECT 1 FROM mail_filter_applied_log
       WHERE filter_id = ? AND account_id = ? AND folder = ? AND uid = ?`
    )
    .get(filterId, accountId, folder, uid);
  return Boolean(row);
}

export function clearFilterLogsForEmail(
  accountId: string,
  folder: string,
  uid: number
): void {
  const db = getDatabase();
  db.prepare(
    `DELETE FROM mail_filter_applied_log
     WHERE account_id = ? AND folder = ? AND uid = ?`
  ).run(accountId, folder, uid);
  db.prepare(
    `DELETE FROM mail_filter_forward_log
     WHERE account_id = ? AND folder = ? AND uid = ?`
  ).run(accountId, folder, uid);
}

export function recordFilterApplied(
  filterId: string,
  accountId: string,
  folder: string,
  uid: number
): void {
  recordFilterAppliedBatch(filterId, [{ accountId, folder, uid }]);
}

export function recordFilterAppliedBatch(
  filterId: string,
  items: Array<{ accountId: string; folder: string; uid: number }>
): void {
  if (items.length === 0) return;

  const db = getDatabase();
  const filter = db
    .prepare("SELECT 1 FROM mail_filters WHERE id = ?")
    .get(filterId);
  if (!filter) return;

  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO mail_filter_applied_log
     (filter_id, account_id, folder, uid, applied_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  const insertMany = db.transaction(
    (rows: Array<{ accountId: string; folder: string; uid: number }>) => {
      for (const row of rows) {
        stmt.run(filterId, row.accountId, row.folder, row.uid, now);
      }
    }
  );
  insertMany(items);
}
