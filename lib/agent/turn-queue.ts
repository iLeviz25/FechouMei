import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentConversationChannel } from "@/lib/agent/types";
import type { Database } from "@/types/database";

type AgentTurnQueueContext = {
  channel: AgentConversationChannel;
  supabase: SupabaseClient<Database>;
  userId: string;
};

type RunQueuedAgentTurnInput<T> = {
  context: AgentTurnQueueContext;
  lockTtlSeconds?: number;
  onTimeout: () => Promise<T>;
  pollMs?: number;
  queueTtlSeconds?: number;
  waitMs?: number;
  work: () => Promise<T>;
};

type ClaimResult = {
  claimed: boolean;
  lockToken?: string;
  reason?: string;
};

const defaultQueueWaitMs = 30000;
const defaultQueuePollMs = 350;
const defaultQueueTtlSeconds = 120;
const defaultLockTtlSeconds = 90;

export const agentTurnQueueBusyReply =
  "Ainda estou processando sua mensagem anterior. Tente novamente em alguns segundos.";

export async function runQueuedAgentTurn<T>({
  context,
  lockTtlSeconds = defaultLockTtlSeconds,
  onTimeout,
  pollMs = defaultQueuePollMs,
  queueTtlSeconds = defaultQueueTtlSeconds,
  waitMs = defaultQueueWaitMs,
  work,
}: RunQueuedAgentTurnInput<T>): Promise<T> {
  const queueId = await enqueueAgentTurn(context, queueTtlSeconds);
  const startedAt = Date.now();
  let lockToken: string | null = null;

  while (Date.now() - startedAt <= waitMs) {
    const claim = await claimAgentTurn(context.supabase, queueId, lockTtlSeconds);

    if (claim.claimed && claim.lockToken) {
      lockToken = claim.lockToken;
      break;
    }

    const remainingMs = waitMs - (Date.now() - startedAt);

    if (remainingMs <= 0 || isTerminalClaimReason(claim.reason)) {
      await abandonAgentTurn(context.supabase, queueId, "Turn timed out before processing.");
      return onTimeout();
    }

    await wait(Math.min(pollMs, remainingMs));
  }

  if (!lockToken) {
    await abandonAgentTurn(context.supabase, queueId, "Turn timed out before processing.");
    return onTimeout();
  }

  const stopHeartbeat = startLockHeartbeat(context.supabase, queueId, lockToken, lockTtlSeconds);

  try {
    const result = await work();
    stopHeartbeat();
    await finishAgentTurn(context.supabase, queueId, lockToken, "completed");
    return result;
  } catch (error) {
    stopHeartbeat();
    await finishAgentTurn(context.supabase, queueId, lockToken, "failed", summarizeError(error));
    throw error;
  }
}

async function enqueueAgentTurn(
  context: AgentTurnQueueContext,
  queueTtlSeconds: number,
) {
  const { data, error } = await context.supabase.rpc("enqueue_agent_turn", {
    target_channel: context.channel,
    target_user_id: context.userId,
    turn_ttl_seconds: queueTtlSeconds,
  });

  if (error) {
    throw new Error(error.message);
  }

  const queueId = asRecord(data).queueId;

  if (typeof queueId !== "string") {
    throw new Error("A fila da Helena nao retornou o id do turno.");
  }

  return queueId;
}

async function claimAgentTurn(
  supabase: SupabaseClient<Database>,
  queueId: string,
  lockTtlSeconds: number,
): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc("claim_agent_turn", {
    lock_ttl_seconds: lockTtlSeconds,
    queue_item_id: queueId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const result = asRecord(data);
  const claimed = result.claimed === true;
  const lockToken = typeof result.lockToken === "string" ? result.lockToken : undefined;
  const reason = typeof result.reason === "string" ? result.reason : undefined;

  return {
    claimed,
    lockToken,
    reason,
  };
}

async function finishAgentTurn(
  supabase: SupabaseClient<Database>,
  queueId: string,
  lockToken: string,
  finalStatus: "completed" | "failed",
  errorText: string | null = null,
) {
  const { error } = await supabase.rpc("finish_agent_turn", {
    error_text: errorText,
    final_status: finalStatus,
    provided_lock_token: lockToken,
    queue_item_id: queueId,
  });

  if (error) {
    console.error("Agent turn lock could not be released.", {
      message: error.message,
      queueId,
    });
  }
}

function startLockHeartbeat(
  supabase: SupabaseClient<Database>,
  queueId: string,
  lockToken: string,
  lockTtlSeconds: number,
) {
  let stopped = false;
  const intervalMs = Math.max(10000, Math.floor((lockTtlSeconds * 1000) / 3));
  const interval = setInterval(() => {
    if (stopped) {
      return;
    }

    void extendAgentTurnLock(supabase, queueId, lockToken, lockTtlSeconds).then((renewed) => {
      if (renewed || stopped) {
        return;
      }

      stopped = true;
      clearInterval(interval);
      console.warn("Agent turn lock heartbeat stopped because the lock was not renewed.", {
        queueId,
      });
    });
  }, intervalMs);

  return () => {
    stopped = true;
    clearInterval(interval);
  };
}

async function extendAgentTurnLock(
  supabase: SupabaseClient<Database>,
  queueId: string,
  lockToken: string,
  lockTtlSeconds: number,
) {
  const { data, error } = await supabase.rpc("extend_agent_turn_lock", {
    lock_ttl_seconds: lockTtlSeconds,
    provided_lock_token: lockToken,
    queue_item_id: queueId,
  });

  if (error) {
    console.warn("Agent turn lock heartbeat failed.", {
      message: error.message,
      queueId,
    });
    return false;
  }

  return data === true;
}

async function abandonAgentTurn(
  supabase: SupabaseClient<Database>,
  queueId: string,
  errorText: string,
) {
  const { error } = await supabase.rpc("abandon_agent_turn", {
    error_text: errorText,
    queue_item_id: queueId,
  });

  if (error) {
    console.warn("Agent queued turn could not be abandoned.", {
      message: error.message,
      queueId,
    });
  }
}

function isTerminalClaimReason(reason: string | undefined) {
  return reason === "abandoned" || reason === "completed" || reason === "expired" || reason === "failed";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function summarizeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 240) : "Erro inesperado.";
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
