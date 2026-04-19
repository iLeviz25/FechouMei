import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgentActionId,
  AgentActionTrace,
  AgentConversationChannel,
  AgentConversationSnapshot,
  AgentConversationState,
  AgentDeleteTarget,
  AgentExpectedResponseKind,
  AgentLastWriteContext,
  AgentMessage,
  AgentMovementDraft,
  AgentTransactionEditDraft,
  MovementField,
} from "@/lib/agent/types";
import { emptyAgentState } from "@/lib/agent/utils";
import type { AgentConversation, AgentPersistedMessage, Database, Json } from "@/types/database";

type AgentPersistenceContext = {
  channel?: AgentConversationChannel;
  supabase: SupabaseClient<Database>;
  userId: string;
};

const defaultChannel: AgentConversationChannel = "playground";
const validStatuses = new Set(["idle", "collecting", "awaiting_confirmation"]);
const validMovementFields = new Set(["amount", "description", "category", "occurred_on"]);
const validExpectedResponseKinds = new Set([
  "confirm_save",
  "confirm_delete",
  "choose_cancel_or_continue",
  "missing_amount",
  "missing_category",
  "missing_description",
  "missing_date",
]);

export class AgentPersistenceSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentPersistenceSetupError";
  }
}

export function isAgentPersistenceSetupError(error: unknown) {
  return error instanceof AgentPersistenceSetupError;
}

export async function loadAgentConversationSnapshot(
  context: AgentPersistenceContext,
): Promise<AgentConversationSnapshot> {
  const conversation = await getOrCreateAgentConversation(context);
  const messages = await getAgentMessages(context, conversation.id);

  return {
    channel: getChannel(context),
    conversationId: conversation.id,
    isPersistent: true,
    messages,
    state: conversationToState(conversation),
  };
}

export async function appendAgentMessage(
  context: AgentPersistenceContext,
  conversationId: string,
  message: Pick<AgentMessage, "content" | "role">,
) {
  const { error } = await context.supabase.from("agent_messages").insert({
    content: message.content,
    conversation_id: conversationId,
    role: message.role,
    user_id: context.userId,
  });

  if (error) {
    throwPersistenceError(error.message);
  }
}

export async function updateAgentConversationState(
  context: AgentPersistenceContext,
  conversationId: string,
  state: AgentConversationState,
) {
  const { error } = await context.supabase
    .from("agent_conversations")
    .update({
      draft: serializeStateDraft(state),
      missing_fields: state.missingFields ?? [],
      pending_action: state.pendingAction ?? null,
      status: state.status,
    })
    .eq("id", conversationId)
    .eq("user_id", context.userId);

  if (error) {
    throwPersistenceError(error.message);
  }
}

export async function persistAgentTurn({
  actionTrace,
  context,
  conversationId,
  nextState,
  reply,
  userMessage,
}: {
  actionTrace?: AgentActionTrace;
  context: AgentPersistenceContext;
  conversationId: string;
  nextState: AgentConversationState;
  reply: string;
  userMessage: string;
}) {
  await appendAgentMessage(context, conversationId, {
    content: userMessage,
    role: "user",
  });
  await appendAgentMessage(context, conversationId, {
    content: reply,
    role: "agent",
  });
  await appendAgentActionEvent(context, conversationId, actionTrace);
  await updateAgentConversationState(context, conversationId, nextState);

  return loadAgentConversationSnapshot(context);
}

async function appendAgentActionEvent(
  context: AgentPersistenceContext,
  conversationId: string,
  actionTrace?: AgentActionTrace,
) {
  if (!actionTrace) {
    return;
  }

  const { error } = await context.supabase.from("agent_action_events").insert({
    action: actionTrace.action,
    confirmation: actionTrace.confirmation ?? null,
    conversation_id: conversationId,
    error: actionTrace.error ?? null,
    status: actionTrace.status,
    summary: actionTrace.summary ?? null,
    user_id: context.userId,
  });

  if (error) {
    if (isMissingAgentActionEventsTableMessage(error.message)) {
      console.error("Agent action event table is not available. Apply the agent action events migration.", error);
      return;
    }

    console.error("Agent action event could not be persisted.", {
      action: actionTrace.action,
      conversationId,
      message: error.message,
      userId: context.userId,
    });
  }
}

export async function clearAgentConversationSnapshot(
  context: AgentPersistenceContext,
): Promise<AgentConversationSnapshot> {
  const conversation = await getOrCreateAgentConversation(context);
  const { error: deleteError } = await context.supabase
    .from("agent_messages")
    .delete()
    .eq("conversation_id", conversation.id)
    .eq("user_id", context.userId);

  if (deleteError) {
    throwPersistenceError(deleteError.message);
  }

  await updateAgentConversationState(context, conversation.id, emptyAgentState());

  return loadAgentConversationSnapshot(context);
}

async function getOrCreateAgentConversation(context: AgentPersistenceContext) {
  const channel = getChannel(context);
  const { data, error } = await context.supabase
    .from("agent_conversations")
    .select("*")
    .eq("user_id", context.userId)
    .eq("channel", channel)
    .maybeSingle();

  if (error) {
    throwPersistenceError(error.message);
  }

  if (data) {
    return data;
  }

  const { data: createdConversation, error: createError } = await context.supabase
    .from("agent_conversations")
    .insert({
      channel,
      user_id: context.userId,
    })
    .select("*")
    .single();

  if (createError) {
    throwPersistenceError(createError.message);
  }

  return createdConversation;
}

async function getAgentMessages(context: AgentPersistenceContext, conversationId: string) {
  const { data, error } = await context.supabase
    .from("agent_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", context.userId)
    .order("created_at", { ascending: true })
    .limit(80);

  if (error) {
    throwPersistenceError(error.message);
  }

  return (data ?? []).map(messageToAgentMessage);
}

function conversationToState(conversation: AgentConversation): AgentConversationState {
  if (!validStatuses.has(conversation.status)) {
    return emptyAgentState();
  }

  return {
    draft: normalizeDraft(conversation.draft),
    deleteTarget: normalizeDeleteTarget(conversation.draft),
    editDraft: normalizeEditDraft(conversation.draft),
    editTarget: normalizeEditTarget(conversation.draft),
    expectedResponseKind: normalizeExpectedResponseKind(conversation.draft),
    lastWrite: normalizeLastWrite(conversation.draft),
    lastWrites: normalizeLastWrites(conversation.draft),
    missingFields: conversation.missing_fields.filter((field): field is MovementField =>
      validMovementFields.has(field),
    ),
    movementBatch: normalizeMovementBatch(conversation.draft),
    pendingAction: conversation.pending_action ? (conversation.pending_action as AgentActionId) : undefined,
    status: conversation.status,
    updatedAt: conversation.updated_at,
  };
}

function messageToAgentMessage(message: Pick<AgentPersistedMessage, "content" | "created_at" | "id" | "role">) {
  return {
    content: message.content,
    created_at: message.created_at,
    id: message.id,
    role: message.role,
  };
}

function serializeStateDraft(state: AgentConversationState): Json {
  return {
    ...(state.draft ?? {}),
    __deleteTarget: state.deleteTarget ?? null,
    __editDraft: state.editDraft ?? null,
    __editTarget: state.editTarget ?? null,
    __expectedResponseKind: state.expectedResponseKind ?? null,
    __lastWrite: state.lastWrite ?? null,
    __lastWrites: state.lastWrites ?? null,
    __movementBatch: state.movementBatch ?? null,
  } as Json;
}

function normalizeExpectedResponseKind(value: Json): AgentExpectedResponseKind | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const rawDraft = value as Record<string, Json | undefined>;
  const expectedResponseKind = rawDraft.__expectedResponseKind;

  return typeof expectedResponseKind === "string" && validExpectedResponseKinds.has(expectedResponseKind)
    ? expectedResponseKind as AgentExpectedResponseKind
    : undefined;
}

function normalizeDraft(value: Json): AgentMovementDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const rawDraft = value as Record<string, Json | undefined>;
  const draft: AgentMovementDraft = {};

  if (rawDraft.type === "entrada" || rawDraft.type === "despesa") {
    draft.type = rawDraft.type;
  }

  if (typeof rawDraft.amount === "number") {
    draft.amount = rawDraft.amount;
  }

  if (typeof rawDraft.description === "string") {
    draft.description = rawDraft.description;
  }

  if (typeof rawDraft.category === "string") {
    draft.category = rawDraft.category;
  }

  if (typeof rawDraft.occurred_on === "string") {
    draft.occurred_on = rawDraft.occurred_on;
  }

  return draft;
}

function normalizeDeleteTarget(value: Json): AgentDeleteTarget | undefined {
  return normalizeMovementTarget(value, "__deleteTarget");
}

function normalizeEditTarget(value: Json): AgentDeleteTarget | undefined {
  return normalizeMovementTarget(value, "__editTarget");
}

function normalizeLastWrite(value: Json): AgentLastWriteContext | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const rawDraft = value as Record<string, Json | undefined>;
  const rawLastWrite = rawDraft.__lastWrite;

  if (!rawLastWrite || typeof rawLastWrite !== "object" || Array.isArray(rawLastWrite)) {
    return undefined;
  }

  const lastWrite = rawLastWrite as Record<string, Json | undefined>;
  const target = normalizeInlineMovementTarget(lastWrite.target);

  if (
    !target ||
    (lastWrite.action !== "register_income" &&
      lastWrite.action !== "register_expense" &&
      lastWrite.action !== "edit_transaction") ||
    (lastWrite.targetKind !== "latest" &&
      lastWrite.targetKind !== "latest_expense" &&
      lastWrite.targetKind !== "latest_income")
  ) {
    return undefined;
  }

  return {
    action: lastWrite.action,
    target,
    targetKind: lastWrite.targetKind,
    updatedAt: typeof lastWrite.updatedAt === "string" ? lastWrite.updatedAt : undefined,
  };
}

function normalizeLastWrites(value: Json): AgentLastWriteContext[] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const rawDraft = value as Record<string, Json | undefined>;
  const rawLastWrites = rawDraft.__lastWrites;

  if (!Array.isArray(rawLastWrites)) {
    const singleLastWrite = normalizeLastWrite(value);
    return singleLastWrite ? [singleLastWrite] : undefined;
  }

  const lastWrites = rawLastWrites
    .map((item) => normalizeInlineLastWrite(item))
    .filter((item): item is AgentLastWriteContext => Boolean(item));

  return lastWrites.length > 0 ? lastWrites : undefined;
}

function normalizeInlineLastWrite(value: Json | undefined): AgentLastWriteContext | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const rawLastWrite = value as Record<string, Json | undefined>;
  const target = normalizeInlineMovementTarget(rawLastWrite.target);

  if (
    !target ||
    (rawLastWrite.action !== "register_income" &&
      rawLastWrite.action !== "register_expense" &&
      rawLastWrite.action !== "edit_transaction") ||
    (rawLastWrite.targetKind !== "latest" &&
      rawLastWrite.targetKind !== "latest_expense" &&
      rawLastWrite.targetKind !== "latest_income")
  ) {
    return undefined;
  }

  return {
    action: rawLastWrite.action,
    target,
    targetKind: rawLastWrite.targetKind,
    updatedAt: typeof rawLastWrite.updatedAt === "string" ? rawLastWrite.updatedAt : undefined,
  };
}

function normalizeMovementBatch(value: Json): AgentMovementDraft[] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const rawDraft = value as Record<string, Json | undefined>;
  const rawBatch = rawDraft.__movementBatch;

  if (!Array.isArray(rawBatch)) {
    return undefined;
  }

  const batch = rawBatch
    .map(normalizeInlineMovementDraft)
    .filter((item): item is AgentMovementDraft => Boolean(item));

  return batch.length > 0 ? batch : undefined;
}

function normalizeInlineMovementDraft(value: Json | undefined): AgentMovementDraft | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const rawDraft = value as Record<string, Json | undefined>;
  const draft: AgentMovementDraft = {};

  if (rawDraft.type === "entrada" || rawDraft.type === "despesa") {
    draft.type = rawDraft.type;
  }

  if (typeof rawDraft.amount === "number") {
    draft.amount = rawDraft.amount;
  }

  if (typeof rawDraft.description === "string") {
    draft.description = rawDraft.description;
  }

  if (typeof rawDraft.category === "string") {
    draft.category = rawDraft.category;
  }

  if (typeof rawDraft.occurred_on === "string") {
    draft.occurred_on = rawDraft.occurred_on;
  }

  return draft.type ? draft : undefined;
}

function normalizeMovementTarget(value: Json, key: "__deleteTarget" | "__editTarget"): AgentDeleteTarget | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const rawDraft = value as Record<string, Json | undefined>;
  const rawTarget = rawDraft[key];

  if (!rawTarget || typeof rawTarget !== "object" || Array.isArray(rawTarget)) {
    return undefined;
  }

  return normalizeInlineMovementTarget(rawTarget);
}

function normalizeInlineMovementTarget(value: Json | undefined): AgentDeleteTarget | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const target = value as Record<string, Json | undefined>;

  if (
    typeof target.id !== "string" ||
    (target.type !== "entrada" && target.type !== "despesa") ||
    typeof target.amount !== "number" ||
    typeof target.description !== "string" ||
    typeof target.category !== "string" ||
    typeof target.occurred_on !== "string"
  ) {
    return undefined;
  }

  return {
    amount: target.amount,
    category: target.category,
    description: target.description,
    id: target.id,
    occurred_on: target.occurred_on,
    type: target.type,
  };
}

function normalizeEditDraft(value: Json): AgentTransactionEditDraft | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const rawDraft = value as Record<string, Json | undefined>;
  const rawEditDraft = rawDraft.__editDraft;

  if (!rawEditDraft || typeof rawEditDraft !== "object" || Array.isArray(rawEditDraft)) {
    return undefined;
  }

  const editDraftValue = rawEditDraft as Record<string, Json | undefined>;
  const editDraft: AgentTransactionEditDraft = {};

  if (typeof editDraftValue.amount === "number") {
    editDraft.amount = editDraftValue.amount;
  }

  if (typeof editDraftValue.description === "string") {
    editDraft.description = editDraftValue.description;
  }

  if (typeof editDraftValue.category === "string") {
    editDraft.category = editDraftValue.category;
  }

  if (typeof editDraftValue.occurred_on === "string") {
    editDraft.occurred_on = editDraftValue.occurred_on;
  }

  return editDraft;
}

function throwPersistenceError(message: string): never {
  if (isUnsupportedAgentChannelMessage(message)) {
    throw new AgentPersistenceSetupError(
      "A tabela de conversas do agente ainda não aceita o canal do WhatsApp. Aplique a migration 20260417000000_add_whatsapp_channel_and_agent_channel_events.sql.",
    );
  }

  if (isMissingAgentTableMessage(message)) {
    throw new AgentPersistenceSetupError(
      "As tabelas do agente ainda não existem no Supabase. Aplique a migration 20260415020000_create_agent_conversations.sql.",
    );
  }

  throw new Error(message);
}

function getChannel(context: AgentPersistenceContext): AgentConversationChannel {
  return context.channel ?? defaultChannel;
}

function isMissingAgentTableMessage(message: string) {
  return (
    message.includes("public.agent_conversations") ||
    message.includes("public.agent_messages") ||
    message.includes("public.agent_action_events") ||
    message.includes("agent_conversations") ||
    message.includes("agent_messages") ||
    message.includes("agent_action_events")
  ) && (
    message.includes("schema cache") ||
    message.includes("Could not find the table") ||
    message.includes("does not exist") ||
    message.includes("relation")
  );
}

function isMissingAgentActionEventsTableMessage(message: string) {
  return isMissingAgentTableMessage(message) && message.includes("agent_action_events");
}

function isUnsupportedAgentChannelMessage(message: string) {
  return (
    (message.includes("agent_conversations_channel_check") ||
      message.includes("violates check constraint") ||
      message.includes("new row for relation \"agent_conversations\"")) &&
    message.includes("channel")
  );
}
