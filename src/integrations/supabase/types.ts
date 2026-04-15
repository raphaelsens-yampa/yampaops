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
      access_levels: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          permissions: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          permissions?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          permissions?: Json
          updated_at?: string
        }
        Relationships: []
      }
      activities: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          notes: string | null
          opportunity_id: string | null
          result: string | null
          scheduled_at: string | null
          type: Database["public"]["Enums"]["activity_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          notes?: string | null
          opportunity_id?: string | null
          result?: string | null
          scheduled_at?: string | null
          type: Database["public"]["Enums"]["activity_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          notes?: string | null
          opportunity_id?: string | null
          result?: string | null
          scheduled_at?: string | null
          type?: Database["public"]["Enums"]["activity_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_products: {
        Row: {
          commission_percent: number
          created_at: string
          id: string
          name: string
          periodicity: string
          plan_mrr: number
          plan_name: string
          plan_value: number
          product_id: string | null
          updated_at: string
        }
        Insert: {
          commission_percent?: number
          created_at?: string
          id?: string
          name: string
          periodicity?: string
          plan_mrr?: number
          plan_name?: string
          plan_value?: number
          product_id?: string | null
          updated_at?: string
        }
        Update: {
          commission_percent?: number
          created_at?: string
          id?: string
          name?: string
          periodicity?: string
          plan_mrr?: number
          plan_name?: string
          plan_value?: number
          product_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      commission_settings: {
        Row: {
          created_at: string
          guarantee_months: number
          id: string
          payment_day: number
          t_plus_months: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          guarantee_months?: number
          id?: string
          payment_day?: number
          t_plus_months?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          guarantee_months?: number
          id?: string
          payment_day?: number
          t_plus_months?: number
          updated_at?: string
        }
        Relationships: []
      }
      commission_triggers: {
        Row: {
          created_at: string
          extra_percent: number
          goal_id: string | null
          goal_type: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          extra_percent?: number
          goal_id?: string | null
          goal_type?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          extra_percent?: number
          goal_id?: string | null
          goal_type?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_triggers_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          commission_amount: number
          created_at: string
          id: string
          opportunity_id: string
          payment_month: string
          product_id: string | null
          sale_date: string
          seller_id: string
          status: Database["public"]["Enums"]["commission_status"]
          type: Database["public"]["Enums"]["commission_type"]
        }
        Insert: {
          commission_amount?: number
          created_at?: string
          id?: string
          opportunity_id: string
          payment_month: string
          product_id?: string | null
          sale_date: string
          seller_id: string
          status?: Database["public"]["Enums"]["commission_status"]
          type?: Database["public"]["Enums"]["commission_type"]
        }
        Update: {
          commission_amount?: number
          created_at?: string
          id?: string
          opportunity_id?: string
          payment_month?: string
          product_id?: string | null
          sale_date?: string
          seller_id?: string
          status?: Database["public"]["Enums"]["commission_status"]
          type?: Database["public"]["Enums"]["commission_type"]
        }
        Relationships: [
          {
            foreignKeyName: "commissions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "commission_products"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company: string | null
          created_at: string
          created_by: string | null
          email: string | null
          icp_level: number | null
          id: string
          name: string
          phone: string | null
          segment: string | null
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          icp_level?: number | null
          id?: string
          name: string
          phone?: string | null
          segment?: string | null
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          icp_level?: number | null
          id?: string
          name?: string
          phone?: string | null
          segment?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          campaign: string | null
          channel: Database["public"]["Enums"]["lead_origin"] | null
          created_at: string
          id: string
          period_end: string
          period_start: string
          scope: string | null
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
          team_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          campaign?: string | null
          channel?: Database["public"]["Enums"]["lead_origin"] | null
          created_at?: string
          id?: string
          period_end: string
          period_start: string
          scope?: string | null
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
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          campaign?: string | null
          channel?: Database["public"]["Enums"]["lead_origin"] | null
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          scope?: string | null
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
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          attribution: Database["public"]["Enums"]["attribution_model"] | null
          billing_type: string
          cancellation_date: string | null
          company: string | null
          consultant_id: string | null
          contact_id: string | null
          created_at: string
          estimated_close_date: string | null
          estimated_mrr: number | null
          estimated_tpv: number | null
          id: string
          is_active: boolean
          last_interaction_at: string | null
          loss_reason: string | null
          name: string
          notes: string | null
          origin: Database["public"]["Enums"]["lead_origin"]
          pipeline_id: string | null
          probability: number | null
          product_id: string | null
          stage: string
          sub_origin: string | null
          take_rate: number | null
          title: string | null
          updated_at: string
        }
        Insert: {
          attribution?: Database["public"]["Enums"]["attribution_model"] | null
          billing_type?: string
          cancellation_date?: string | null
          company?: string | null
          consultant_id?: string | null
          contact_id?: string | null
          created_at?: string
          estimated_close_date?: string | null
          estimated_mrr?: number | null
          estimated_tpv?: number | null
          id?: string
          is_active?: boolean
          last_interaction_at?: string | null
          loss_reason?: string | null
          name: string
          notes?: string | null
          origin?: Database["public"]["Enums"]["lead_origin"]
          pipeline_id?: string | null
          probability?: number | null
          product_id?: string | null
          stage?: string
          sub_origin?: string | null
          take_rate?: number | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          attribution?: Database["public"]["Enums"]["attribution_model"] | null
          billing_type?: string
          cancellation_date?: string | null
          company?: string | null
          consultant_id?: string | null
          contact_id?: string | null
          created_at?: string
          estimated_close_date?: string | null
          estimated_mrr?: number | null
          estimated_tpv?: number | null
          id?: string
          is_active?: boolean
          last_interaction_at?: string | null
          loss_reason?: string | null
          name?: string
          notes?: string | null
          origin?: Database["public"]["Enums"]["lead_origin"]
          pipeline_id?: string | null
          probability?: number | null
          product_id?: string | null
          stage?: string
          sub_origin?: string | null
          take_rate?: number | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "commission_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_lost: boolean
          is_won: boolean
          name: string
          pipeline_id: string
          position: number
          slug: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name: string
          pipeline_id?: string
          position?: number
          slug: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name?: string
          pipeline_id?: string
          position?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          birth_date: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stripe_prices: {
        Row: {
          area: string | null
          commission_product_id: string | null
          commission_value: number
          created_at: string
          id: string
          mrr: number
          plan_name: string
          price_id: string
          product_name: string
          seller_id: string | null
          updated_at: string
        }
        Insert: {
          area?: string | null
          commission_product_id?: string | null
          commission_value?: number
          created_at?: string
          id?: string
          mrr?: number
          plan_name: string
          price_id: string
          product_name: string
          seller_id?: string | null
          updated_at?: string
        }
        Update: {
          area?: string | null
          commission_product_id?: string | null
          commission_value?: number
          created_at?: string
          id?: string
          mrr?: number
          plan_name?: string
          price_id?: string
          product_name?: string
          seller_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_prices_product_id_fkey"
            columns: ["commission_product_id"]
            isOneToOne: false
            referencedRelation: "commission_products"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          role_in_team: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role_in_team?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role_in_team?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_access_levels: {
        Row: {
          access_level_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          access_level_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          access_level_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_access_levels_access_level_id_fkey"
            columns: ["access_level_id"]
            isOneToOne: false
            referencedRelation: "access_levels"
            referencedColumns: ["id"]
          },
        ]
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
        | "whatsapp"
        | "proposta"
      app_role: "admin" | "seller"
      attribution_model: "first_click" | "last_click"
      commission_status: "provisioned" | "paid" | "reversed"
      commission_type: "earned" | "clawback"
      lead_origin:
        | "freetrial"
        | "cursos"
        | "outbound"
        | "campanhas"
        | "base"
        | "campanhas_marketing"
        | "campanhas_base"
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
        "whatsapp",
        "proposta",
      ],
      app_role: ["admin", "seller"],
      attribution_model: ["first_click", "last_click"],
      commission_status: ["provisioned", "paid", "reversed"],
      commission_type: ["earned", "clawback"],
      lead_origin: [
        "freetrial",
        "cursos",
        "outbound",
        "campanhas",
        "base",
        "campanhas_marketing",
        "campanhas_base",
      ],
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
