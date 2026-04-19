"use server";

import { revalidatePath } from "next/cache";
import { runAgentTurn } from "@/lib/agent/orchestrator";
import {
  clearAgentConversationSnapshot,
  isAgentPersistenceSetupError,
  loadAgentConversationSnapshot,
  persistAgentTurn,
} from "@/lib/agent/persistence";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  getWhatsAppAssistantActivationSnapshot,
  startWhatsAppAssistantActivation,
  unlinkWhatsAppAssistant,
  type WhatsAppAssistantActivationSnapshot,
} from "@/lib/channels/whatsapp/activation";
import { emptyAgentState } from "@/lib/agent/utils";
import type {
  AgentConversationSnapshot,
  AgentConversationState,
  AgentTurnPersistedResult,
} from "@/lib/agent/types";

const transientConversationId = "agent-playground-transient";

async function getAgentContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Faça login novamente para usar o assistente.");
  }

  return { supabase, userId: user.id };
}

async function getWhatsAppActivationContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Faça login novamente para usar o assistente.");
  }

  return { supabase: createServiceRoleClient(), userId: user.id };
}

export async function getAgentConversation(): Promise<AgentConversationSnapshot> {
  const context = await getAgentContext();

  try {
    return await loadAgentConversationSnapshot(context);
  } catch (error) {
    if (isAgentPersistenceSetupError(error)) {
      return getTransientSnapshot();
    }

    throw error;
  }
}

export async function getWhatsAppActivation(): Promise<WhatsAppAssistantActivationSnapshot> {
  const context = await getWhatsAppActivationContext();
  return getWhatsAppAssistantActivationSnapshot(context);
}

export async function startWhatsAppActivation(): Promise<WhatsAppAssistantActivationSnapshot> {
  const context = await getWhatsAppActivationContext();
  const snapshot = await startWhatsAppAssistantActivation(context);
  revalidatePath("/app/agente");
  return snapshot;
}

export async function disconnectWhatsAppAssistant(): Promise<WhatsAppAssistantActivationSnapshot> {
  const context = await getWhatsAppActivationContext();
  const snapshot = await unlinkWhatsAppAssistant(context);
  revalidatePath("/app/agente");
  return snapshot;
}

export async function sendAgentMessage({
  message,
  transientState,
}: {
  message: string;
  transientState?: AgentConversationState;
}): Promise<AgentTurnPersistedResult> {
  const context = await getAgentContext();
  let snapshot: AgentConversationSnapshot;

  try {
    snapshot = await loadAgentConversationSnapshot(context);
  } catch (error) {
    if (!isAgentPersistenceSetupError(error)) {
      throw error;
    }

    const result = await runAgentTurn({
      message,
      state: transientState ?? emptyAgentState(),
    });

    return {
      ...getTransientSnapshot(result.state),
      reply: result.reply,
    };
  }

  const result = await runAgentTurn({
    message,
    state: snapshot.state,
  });
  const updatedSnapshot = await persistAgentTurn({
    actionTrace: result.actionTrace,
    context,
    conversationId: snapshot.conversationId,
    nextState: result.state,
    reply: result.reply,
    userMessage: message,
  });

  return {
    ...updatedSnapshot,
    reply: result.reply,
  };
}

export async function clearAgentConversation(): Promise<AgentConversationSnapshot> {
  const context = await getAgentContext();

  try {
    return await clearAgentConversationSnapshot(context);
  } catch (error) {
    if (isAgentPersistenceSetupError(error)) {
      return getTransientSnapshot();
    }

    throw error;
  }
}

function getTransientSnapshot(state: AgentConversationState = emptyAgentState()): AgentConversationSnapshot {
  return {
    conversationId: transientConversationId,
    isPersistent: false,
    messages: [],
    state,
  };
}
