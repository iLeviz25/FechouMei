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
      admin_audit_events: {
        Row: {
          id: string;
          actor_id: string | null;
          target_user_id: string | null;
          origin: "admin" | "helena" | "whatsapp" | "auth" | "app" | "supabase" | "sistema";
          severity: "info" | "warning" | "error" | "critical";
          event_type: string;
          status: string;
          message: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          target_user_id?: string | null;
          origin?: "admin" | "helena" | "whatsapp" | "auth" | "app" | "supabase" | "sistema";
          severity?: "info" | "warning" | "error" | "critical";
          event_type: string;
          status?: string;
          message?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string | null;
          target_user_id?: string | null;
          origin?: "admin" | "helena" | "whatsapp" | "auth" | "app" | "supabase" | "sistema";
          severity?: "info" | "warning" | "error" | "critical";
          event_type?: string;
          status?: string;
          message?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_audit_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_audit_events_target_user_id_fkey";
            columns: ["target_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
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
      agent_prompt_traces: {
        Row: {
          id: string;
          user_id: string | null;
          channel: "playground" | "whatsapp" | "system";
          model: string | null;
          trace_type: "interpretation" | "transcription" | "routing" | "fallback";
          status: "success" | "error" | "skipped";
          action_name: string | null;
          prompt_preview: string | null;
          prompt_text: string | null;
          user_message_preview: string | null;
          response_preview: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          channel?: "playground" | "whatsapp" | "system";
          model?: string | null;
          trace_type?: "interpretation" | "transcription" | "routing" | "fallback";
          status?: "success" | "error" | "skipped";
          action_name?: string | null;
          prompt_preview?: string | null;
          prompt_text?: string | null;
          user_message_preview?: string | null;
          response_preview?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          channel?: "playground" | "whatsapp" | "system";
          model?: string | null;
          trace_type?: "interpretation" | "transcription" | "routing" | "fallback";
          status?: "success" | "error" | "skipped";
          action_name?: string | null;
          prompt_preview?: string | null;
          prompt_text?: string | null;
          user_message_preview?: string | null;
          response_preview?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_prompt_traces_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      app_settings: {
        Row: {
          key: string;
          value: Json;
          description: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          key: string;
          value?: Json;
          description?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          key?: string;
          value?: Json;
          description?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      import_sessions: {
        Row: {
          id: string;
          user_id: string;
          source: "whatsapp" | "upload";
          channel_remote_id: string | null;
          file_name: string | null;
          file_type: string | null;
          status: "draft" | "reviewed" | "imported" | "expired" | "failed" | "cancelled";
          summary: Json;
          created_at: string;
          updated_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source?: "whatsapp" | "upload";
          channel_remote_id?: string | null;
          file_name?: string | null;
          file_type?: string | null;
          status?: "draft" | "reviewed" | "imported" | "expired" | "failed" | "cancelled";
          summary?: Json;
          created_at?: string;
          updated_at?: string;
          expires_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source?: "whatsapp" | "upload";
          channel_remote_id?: string | null;
          file_name?: string | null;
          file_type?: string | null;
          status?: "draft" | "reviewed" | "imported" | "expired" | "failed" | "cancelled";
          summary?: Json;
          created_at?: string;
          updated_at?: string;
          expires_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "import_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      import_session_rows: {
        Row: {
          id: string;
          session_id: string;
          row_index: number;
          raw_data: Json;
          normalized_data: Json;
          status: "valid" | "error" | "duplicate" | "duplicate_file" | "duplicate_existing";
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          row_index: number;
          raw_data?: Json;
          normalized_data?: Json;
          status: "valid" | "error" | "duplicate" | "duplicate_file" | "duplicate_existing";
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          row_index?: number;
          raw_data?: Json;
          normalized_data?: Json;
          status?: "valid" | "error" | "duplicate" | "duplicate_file" | "duplicate_existing";
          error_message?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "import_session_rows_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "import_sessions";
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
          onboarding_tour_completed_at: string | null;
          role: "user" | "admin";
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
          onboarding_tour_completed_at?: string | null;
          role?: "user" | "admin";
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
          onboarding_tour_completed_at?: string | null;
          role?: "user" | "admin";
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
    Functions: {
      get_admin_overview_metrics: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_admin_helena_dashboard: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_admin_agent_prompt_detail: {
        Args: {
          trace_id: string;
        };
        Returns: Json;
      };
      get_admin_agent_prompts: {
        Args: {
          search_text?: string | null;
          status_filter?: "success" | "error" | "skipped" | null;
          type_filter?: "interpretation" | "transcription" | "routing" | "fallback" | null;
          page_size?: number | null;
          page_offset?: number | null;
        };
        Returns: Json;
      };
      get_agent_runtime_settings: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_admin_logs: {
        Args: {
          search_text?: string | null;
          severity_filter?: "info" | "warning" | "error" | "critical" | null;
          origin_filter?: "helena" | "whatsapp" | "auth" | "app" | "supabase" | "sistema" | "admin" | null;
          period_filter?: "24h" | "7d" | "30d" | null;
          page_size?: number | null;
          page_offset?: number | null;
        };
        Returns: Json;
      };
      get_admin_settings: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_admin_user_detail: {
        Args: {
          target_user_id: string;
        };
        Returns: Json;
      };
      get_admin_users: {
        Args: {
          search_text?: string | null;
          role_filter?: "user" | "admin" | null;
          whatsapp_filter?: "linked" | "unlinked" | null;
          page_size?: number | null;
          page_offset?: number | null;
        };
        Returns: Json;
      };
      is_admin: {
        Args: {
          user_id?: string;
        };
        Returns: boolean;
      };
      set_user_role: {
        Args: {
          target_user_id: string;
          new_role: "user" | "admin";
        };
        Returns: void;
      };
      record_agent_prompt_trace: {
        Args: {
          target_user_id: string;
          trace_channel: "playground" | "whatsapp" | "system";
          trace_model: string | null;
          trace_type: "interpretation" | "transcription" | "routing" | "fallback";
          trace_status: "success" | "error" | "skipped";
          action_name: string | null;
          prompt_text: string;
          user_message?: string | null;
          response_text?: string | null;
          metadata?: Json;
        };
        Returns: string;
      };
      update_admin_setting: {
        Args: {
          setting_key: string;
          setting_value: Json;
        };
        Returns: Json;
      };
    };
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
export type AgentPromptTrace = Database["public"]["Tables"]["agent_prompt_traces"]["Row"];
export type ImportSession = Database["public"]["Tables"]["import_sessions"]["Row"];
export type ImportSessionRow = Database["public"]["Tables"]["import_session_rows"]["Row"];
export type WhatsAppAssistantLink = Database["public"]["Tables"]["whatsapp_assistant_links"]["Row"];
