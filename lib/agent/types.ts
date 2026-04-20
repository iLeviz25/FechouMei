export type AgentActionId =
  | "register_income"
  | "register_expense"
  | "register_movements_batch"
  | "monthly_summary"
  | "dashboard_overview"
  | "yearly_revenue"
  | "mei_limit"
  | "obligations_status"
  | "recent_transactions"
  | "latest_transaction"
  | "mark_obligation"
  | "reminder_preferences_status"
  | "update_reminder_preferences"
  | "set_initial_balance"
  | "edit_transaction"
  | "delete_transaction"
  | "quick_period_query"
  | "export_transactions"
  | "profile_overview";

export type AgentActionStatus = "implemented" | "planned";
export type AgentActionTraceStatus =
  | "collecting"
  | "confirmation_requested"
  | "executed"
  | "cancelled"
  | "failed";
export type AgentActionTraceConfirmation =
  | "not_required"
  | "requested"
  | "confirmed"
  | "cancelled";
export type AgentMessageKind =
  | "greeting"
  | "small_talk"
  | "capabilities"
  | "product_question"
  | "read_query"
  | "write_action"
  | "confirmation"
  | "cancelation"
  | "correction"
  | "unsupported_or_unknown"
  | "interruption";

export type AgentActionDefinition = {
  id: AgentActionId;
  label: string;
  status: AgentActionStatus;
  changesData: boolean;
  description: string;
};

export type AgentActionTrace = {
  action: AgentActionId;
  status: AgentActionTraceStatus;
  confirmation?: AgentActionTraceConfirmation;
  summary?: string;
  error?: string;
};

export type AgentConversationChannel = "playground" | "whatsapp";
export type MovementType = "entrada" | "despesa";
export type MovementField = "amount" | "description" | "category" | "occurred_on";
export type TransactionEditField = "amount" | "description" | "category" | "occurred_on";
export type TransactionTargetKind = "latest" | "latest_expense" | "latest_income";
export type AgentExpectedResponseKind =
  | "confirm_save"
  | "confirm_delete"
  | "choose_cancel_or_continue"
  | "missing_amount"
  | "missing_category"
  | "missing_description"
  | "missing_date";
export type ReminderPreferenceKey =
  | "das_monthly_enabled"
  | "dasn_annual_enabled"
  | "monthly_review_enabled"
  | "receipts_enabled";

export type AgentQuickPeriodRange =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_days";
export type AgentQuickPeriodMetric = "income" | "expense" | "balance" | "summary";

export type AgentQuickPeriodQuery =
  | {
      days?: number;
      metric: AgentQuickPeriodMetric;
      range: AgentQuickPeriodRange;
      type: "period";
    }
  | {
      metric: "income" | "expense";
      type: "weekly_extreme";
    };

export type AgentMovementDraft = {
  type?: MovementType;
  amount?: number;
  description?: string;
  category?: string;
  occurred_on?: string;
};

export type AgentDeleteTarget = {
  id: string;
  type: MovementType;
  amount: number;
  description: string;
  category: string;
  occurred_on: string;
};

export type AgentTransactionEditDraft = {
  amount?: number;
  category?: string;
  description?: string;
  occurred_on?: string;
};

export type AgentReminderPreferenceUpdate = {
  enabled: boolean;
  keys?: ReminderPreferenceKey[];
};

export type AgentLastWriteContext = {
  action: "register_income" | "register_expense" | "edit_transaction";
  target: AgentDeleteTarget;
  targetKind: TransactionTargetKind;
  updatedAt?: string;
};

export type AgentConversationState = {
  status: "idle" | "collecting" | "awaiting_confirmation";
  pendingAction?: AgentActionId;
  draft?: AgentMovementDraft;
  deleteTarget?: AgentDeleteTarget;
  editDraft?: AgentTransactionEditDraft;
  editTarget?: AgentDeleteTarget;
  expectedResponseKind?: AgentExpectedResponseKind;
  lastWrite?: AgentLastWriteContext;
  lastWrites?: AgentLastWriteContext[];
  missingFields?: MovementField[];
  movementBatch?: AgentMovementDraft[];
  updatedAt?: string;
};

export type AgentModelInterpretation = {
  action: AgentActionId | "unknown";
  confidence: "high" | "medium" | "low";
  kind?: AgentMessageKind;
  confirmation?: "yes" | "no" | "unclear";
  fields?: AgentMovementDraft;
};

export type AgentTurnResult = {
  actionTrace?: AgentActionTrace;
  reply: string;
  state: AgentConversationState;
};

export type AgentMessage = {
  id: string;
  role: "user" | "agent";
  content: string;
  created_at?: string;
};

export type AgentConversationSnapshot = {
  channel?: AgentConversationChannel;
  conversationId: string;
  isPersistent?: boolean;
  messages: AgentMessage[];
  state: AgentConversationState;
};

export type AgentTurnPersistedResult = AgentConversationSnapshot & {
  reply: string;
};
