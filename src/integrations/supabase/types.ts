export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          notes: string | null
          type: Database["public"]["Enums"]["activity_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          notes?: string | null
          type: Database["public"]["Enums"]["activity_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          notes?: string | null
          type?: Database["public"]["Enums"]["activity_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          channel: Database["public"]["Enums"]["lead_origin"] | null
          created_at: string
          id: string
          period_end: string
          period_start: string
          target_agendamentos: number | null
          target_comparecimentos: number | null
          target_conversoes: number | null
          target_deals: number | null
          target_mrr: number | null
          target_prospeccoes: number | null
          target_respostas: number | null
          target_taxa_agendamento: number | null
          target_taxa_comparecimento: number | null
          target_taxa_conversao: number | null
          target_taxa_resposta: number | null
          target_tpv: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          channel?: Database["public"]["Enums"]["lead_origin"] | null
          created_at?: string
          id?: string
          period_end: string
          period_start: string
          target_agendamentos?: number | null
          target_comparecimentos?: number | null
          target_conversoes?: number | null
          target_deals?: number | null
          target_mrr?: number | null
          target_prospeccoes?: number | null
          target_respostas?: number | null
          target_taxa_agendamento?: number | null
          target_taxa_comparecimento?: number | null
          target_taxa_conversao?: number | null
          target_taxa_resposta?: number | null
          target_tpv?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["lead_origin"] | null
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          target_agendamentos?: number | null
          target_comparecimentos?: number | null
          target_conversoes?: number | null
          target_deals?: number | null
          target_mrr?: number | null
          target_prospeccoes?: number | null
          target_respostas?: number | null
          target_taxa_agendamento?: number | null
          target_taxa_comparecimento?: number | null
          target_taxa_conversao?: number | null
          target_taxa_resposta?: number | null
          target_tpv?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          attribution: Database["public"]["Enums"]["attribution_model"] | null
          company: string | null
          consultant_id: string | null
          created_at: string
          estimated_mrr: number | null
          estimated_tpv: number | null
          id: string
          last_interaction_at: string | null
          name: string
          notes: string | null
          origin: Database["public"]["Enums"]["lead_origin"]
          stage: Database["public"]["Enums"]["lead_stage"]
          take_rate: number | null
          updated_at: string
        }
        Insert: {
          attribution?: Database["public"]["Enums"]["attribution_model"] | null
          company?: string | null
          consultant_id?: string | null
          created_at?: string
          estimated_mrr?: number | null
          estimated_tpv?: number | null
          id?: string
          last_interaction_at?: string | null
          name: string
          notes?: string | null
          origin?: Database["public"]["Enums"]["lead_origin"]
          stage?: Database["public"]["Enums"]["lead_stage"]
          take_rate?: number | null
          updated_at?: string
        }
        Update: {
          attribution?: Database["public"]["Enums"]["attribution_model"] | null
          company?: string | null
          consultant_id?: string | null
          created_at?: string
          estimated_mrr?: number | null
          estimated_tpv?: number | null
          id?: string
          last_interaction_at?: string | null
          name?: string
          notes?: string | null
          origin?: Database["public"]["Enums"]["lead_origin"]
          stage?: Database["public"]["Enums"]["lead_stage"]
          take_rate?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      activity_type:
        | "mensagem_enviada"
        | "resposta_recebida"
        | "call_realizada"
        | "reuniao_executada"
      app_role: "admin" | "seller"
      attribution_model: "first_click" | "last_click"
      lead_origin: "freetrial" | "cursos" | "outbound" | "campanhas" | "base"
      lead_stage:
        | "novo_lead"
        | "contato_realizado"
        | "diagnostico"
        | "proposta_enviada"
        | "negociacao"
        | "fechado_won"
        | "perdido"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_type: [
        "mensagem_enviada",
        "resposta_recebida",
        "call_realizada",
        "reuniao_executada",
      ],
      app_role: ["admin", "seller"],
      attribution_model: ["first_click", "last_click"],
      lead_origin: ["freetrial", "cursos", "outbound", "campanhas", "base"],
      lead_stage: [
        "novo_lead",
        "contato_realizado",
        "diagnostico",
        "proposta_enviada",
        "negociacao",
        "fechado_won",
        "perdido",
      ],
    },
  },
} as const
