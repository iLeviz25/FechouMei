export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      agent_conversations: {
        Row: {
          id: string;
          user_id: string;
          channel: "playground" | "whatsapp";
          status: "idle" | "collecting" | "awaiting_confirmation";
          pending_action: string | null;
          draft: Json;
          missing_fields: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          channel?: "playground" | "whatsapp";
          status?: "idle" | "collecting" | "awaiting_confirmation";
          pending_action?: string | null;
          draft?: Json;
          missing_fields?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          channel?: "playground" | "whatsapp";
          status?: "idle" | "collecting" | "awaiting_confirmation";
          pending_action?: string | null;
          draft?: Json;
          missing_fields?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_conversations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_messages: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
          role: "user" | "agent";
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          user_id: string;
          role: "user" | "agent";
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          user_id?: string;
          role?: "user" | "agent";
          content?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "agent_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_messages_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_action_events: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
          action: string;
          status: "collecting" | "confirmation_requested" | "executed" | "cancelled" | "failed";
          confirmation: "not_required" | "requested" | "confirmed" | "cancelled" | null;
          summary: string | null;
          error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          user_id: string;
          action: string;
          status: "collecting" | "confirmation_requested" | "executed" | "cancelled" | "failed";
          confirmation?: "not_required" | "requested" | "confirmed" | "cancelled" | null;
          summary?: string | null;
          error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          user_id?: string;
          action?: string;
          status?: "collecting" | "confirmation_requested" | "executed" | "cancelled" | "failed";
          confirmation?: "not_required" | "requested" | "confirmed" | "cancelled" | null;
          summary?: string | null;
          error?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_action_events_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "agent_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_action_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_channel_events: {
        Row: {
          id: string;
          channel: "whatsapp";
          direction: "inbound";
          provider: string;
          external_message_id: string;
          provider_instance: string | null;
          remote_id: string | null;
          user_id: string | null;
          conversation_id: string | null;
          status: "received" | "processed" | "discarded" | "failed";
          summary: string | null;
          error: string | null;
          message_text: string | null;
          created_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: string;
          channel?: "whatsapp";
          direction?: "inbound";
          provider?: string;
          external_message_id: string;
          provider_instance?: string | null;
          remote_id?: string | null;
          user_id?: string | null;
          conversation_id?: string | null;
          status: "received" | "processed" | "discarded" | "failed";
          summary?: string | null;
          error?: string | null;
          message_text?: string | null;
          created_at?: string;
          processed_at?: string | null;
        };
        Update: {
          id?: string;
          channel?: "whatsapp";
          direction?: "inbound";
          provider?: string;
          external_message_id?: string;
          provider_instance?: string | null;
          remote_id?: string | null;
          user_id?: string | null;
          conversation_id?: string | null;
          status?: "received" | "processed" | "discarded" | "failed";
          summary?: string | null;
          error?: string | null;
          message_text?: string | null;
          created_at?: string;
          processed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "agent_channel_events_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "agent_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_channel_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_assistant_links: {
        Row: {
          id: string;
          user_id: string;
          phone_number: string | null;
          remote_jid: string | null;
          status: "pending" | "linked" | "expired" | "revoked";
          activation_code: string | null;
          activation_expires_at: string | null;
          linked_at: string | null;
          last_inbound_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          phone_number?: string | null;
          remote_jid?: string | null;
          status?: "pending" | "linked" | "expired" | "revoked";
          activation_code?: string | null;
          activation_expires_at?: string | null;
          linked_at?: string | null;
          last_inbound_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          phone_number?: string | null;
          remote_jid?: string | null;
          status?: "pending" | "linked" | "expired" | "revoked";
          activation_code?: string | null;
          activation_expires_at?: string | null;
          linked_at?: string | null;
          last_inbound_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_assistant_links_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      reminder_preferences: {
        Row: {
          user_id: string;
          das_monthly_enabled: boolean;
          dasn_annual_enabled: boolean;
          monthly_review_enabled: boolean;
          receipts_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          das_monthly_enabled?: boolean;
          dasn_annual_enabled?: boolean;
          monthly_review_enabled?: boolean;
          receipts_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          das_monthly_enabled?: boolean;
          dasn_annual_enabled?: boolean;
          monthly_review_enabled?: boolean;
          receipts_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reminder_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      obrigacoes_checklist: {
        Row: {
          id: string;
          user_id: string;
          month: string;
          item_key: string;
          done: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          month: string;
          item_key: string;
          done?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          month?: string;
          item_key?: string;
          done?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "obrigacoes_checklist_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      movimentacoes: {
        Row: {
          id: string;
          user_id: string;
          type: "entrada" | "despesa";
          description: string;
          amount: number;
          occurred_on: string;
          occurred_at: string;
          category: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: "entrada" | "despesa";
          description: string;
          amount: number;
          occurred_on?: string;
          occurred_at?: string;
          category: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: "entrada" | "despesa";
          description?: string;
          amount?: number;
          occurred_on?: string;
          occurred_at?: string;
          category?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "movimentacoes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          work_type: string | null;
          business_mode: string | null;
          main_category: string | null;
          main_goal: string | null;
          initial_balance: number;
          onboarding_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          work_type?: string | null;
          business_mode?: string | null;
          main_category?: string | null;
          main_goal?: string | null;
          initial_balance?: number;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          work_type?: string | null;
          business_mode?: string | null;
          main_category?: string | null;
          main_goal?: string | null;
          initial_balance?: number;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Movimentacao = Database["public"]["Tables"]["movimentacoes"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ReminderPreferences = Database["public"]["Tables"]["reminder_preferences"]["Row"];
export type AgentConversation = Database["public"]["Tables"]["agent_conversations"]["Row"];
export type AgentPersistedMessage = Database["public"]["Tables"]["agent_messages"]["Row"];
export type AgentActionEvent = Database["public"]["Tables"]["agent_action_events"]["Row"];
export type AgentChannelEvent = Database["public"]["Tables"]["agent_channel_events"]["Row"];
export type WhatsAppAssistantLink = Database["public"]["Tables"]["whatsapp_assistant_links"]["Row"];
