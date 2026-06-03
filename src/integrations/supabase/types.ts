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
      ac_pipeline_selection: {
        Row: {
          ac_pipeline_id: string
          ac_pipeline_title: string
          created_at: string
          deals_count: number | null
          is_selected: boolean
          last_synced_at: string | null
          local_pipeline_id: string | null
          updated_at: string
        }
        Insert: {
          ac_pipeline_id: string
          ac_pipeline_title: string
          created_at?: string
          deals_count?: number | null
          is_selected?: boolean
          last_synced_at?: string | null
          local_pipeline_id?: string | null
          updated_at?: string
        }
        Update: {
          ac_pipeline_id?: string
          ac_pipeline_title?: string
          created_at?: string
          deals_count?: number | null
          is_selected?: boolean
          last_synced_at?: string | null
          local_pipeline_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
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
          ac_id: string | null
          chatwoot_conversation_id: number | null
          chatwoot_message_id: number | null
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
          ac_id?: string | null
          chatwoot_conversation_id?: number | null
          chatwoot_message_id?: number | null
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
          ac_id?: string | null
          chatwoot_conversation_id?: number | null
          chatwoot_message_id?: number | null
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
      chatwoot_audit_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string
          id: string
          message: string
          metadata: Json
          severity: string
          target_email: string | null
          target_inbox: string | null
          target_user_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string
          id?: string
          message: string
          metadata?: Json
          severity?: string
          target_email?: string | null
          target_inbox?: string | null
          target_user_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string
          id?: string
          message?: string
          metadata?: Json
          severity?: string
          target_email?: string | null
          target_inbox?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      chatwoot_audit_golden_set: {
        Row: {
          conversation_id: number
          created_at: string
          created_by: string | null
          expected_flags: Json
          expected_overall_score: number | null
          expected_severity: string
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          conversation_id: number
          created_at?: string
          created_by?: string | null
          expected_flags?: Json
          expected_overall_score?: number | null
          expected_severity: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          conversation_id?: number
          created_at?: string
          created_by?: string | null
          expected_flags?: Json
          expected_overall_score?: number | null
          expected_severity?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      chatwoot_audit_reports: {
        Row: {
          created_at: string
          id: string
          payload: Json
          period_end: string | null
          period_start: string | null
          report_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          period_end?: string | null
          period_start?: string | null
          report_type: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          period_end?: string | null
          period_start?: string | null
          report_type?: string
        }
        Relationships: []
      }
      chatwoot_audit_rubric_versions: {
        Row: {
          ai_model: string | null
          churn_signal_types: Json
          created_at: string
          created_by: string | null
          custom_instructions: string | null
          id: string
          notes: string | null
          playbook_items: Json
          playbook_markdown: string | null
          scoring_rubric: string | null
          tone_categories: Json
          version_label: string | null
        }
        Insert: {
          ai_model?: string | null
          churn_signal_types?: Json
          created_at?: string
          created_by?: string | null
          custom_instructions?: string | null
          id?: string
          notes?: string | null
          playbook_items?: Json
          playbook_markdown?: string | null
          scoring_rubric?: string | null
          tone_categories?: Json
          version_label?: string | null
        }
        Update: {
          ai_model?: string | null
          churn_signal_types?: Json
          created_at?: string
          created_by?: string | null
          custom_instructions?: string | null
          id?: string
          notes?: string | null
          playbook_items?: Json
          playbook_markdown?: string | null
          scoring_rubric?: string | null
          tone_categories?: Json
          version_label?: string | null
        }
        Relationships: []
      }
      chatwoot_audit_runs: {
        Row: {
          analyzed: number
          created_at: string
          error_message: string | null
          failed: number
          finished_at: string | null
          id: string
          period_end: string | null
          period_start: string | null
          started_at: string
          status: string
          total_conversations: number
          triggered_by: string | null
        }
        Insert: {
          analyzed?: number
          created_at?: string
          error_message?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          started_at?: string
          status?: string
          total_conversations?: number
          triggered_by?: string | null
        }
        Update: {
          analyzed?: number
          created_at?: string
          error_message?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          started_at?: string
          status?: string
          total_conversations?: number
          triggered_by?: string | null
        }
        Relationships: []
      }
      chatwoot_audit_settings: {
        Row: {
          ai_model: string
          attention_threshold: number
          churn_signal_types: Json
          competitor_keywords: string[]
          created_at: string
          critical_threshold: number
          custom_instructions: string | null
          daily_audit_cap: number | null
          human_review_new_seller_days: number
          human_review_new_seller_percent: number
          human_review_percent_per_seller: number
          id: string
          low_confidence_threshold: number
          must_audit_critical: boolean
          must_audit_lost: boolean
          must_audit_sla_breach: boolean
          must_review_critical: boolean
          must_review_lost: boolean
          must_review_low_confidence: boolean
          must_review_sla_breach: boolean
          playbook_items: Json
          playbook_markdown: string | null
          product_knowledge_base: string | null
          profanity_keywords: string[]
          sampling_enabled: boolean
          sampling_new_seller_days: number
          sampling_new_seller_percent: number
          sampling_percent_per_seller: number
          scoring_rubric: string | null
          sla_breach_seconds: number
          system_message_patterns: string[]
          tone_categories: Json
          updated_at: string
        }
        Insert: {
          ai_model?: string
          attention_threshold?: number
          churn_signal_types?: Json
          competitor_keywords?: string[]
          created_at?: string
          critical_threshold?: number
          custom_instructions?: string | null
          daily_audit_cap?: number | null
          human_review_new_seller_days?: number
          human_review_new_seller_percent?: number
          human_review_percent_per_seller?: number
          id?: string
          low_confidence_threshold?: number
          must_audit_critical?: boolean
          must_audit_lost?: boolean
          must_audit_sla_breach?: boolean
          must_review_critical?: boolean
          must_review_lost?: boolean
          must_review_low_confidence?: boolean
          must_review_sla_breach?: boolean
          playbook_items?: Json
          playbook_markdown?: string | null
          product_knowledge_base?: string | null
          profanity_keywords?: string[]
          sampling_enabled?: boolean
          sampling_new_seller_days?: number
          sampling_new_seller_percent?: number
          sampling_percent_per_seller?: number
          scoring_rubric?: string | null
          sla_breach_seconds?: number
          system_message_patterns?: string[]
          tone_categories?: Json
          updated_at?: string
        }
        Update: {
          ai_model?: string
          attention_threshold?: number
          churn_signal_types?: Json
          competitor_keywords?: string[]
          created_at?: string
          critical_threshold?: number
          custom_instructions?: string | null
          daily_audit_cap?: number | null
          human_review_new_seller_days?: number
          human_review_new_seller_percent?: number
          human_review_percent_per_seller?: number
          id?: string
          low_confidence_threshold?: number
          must_audit_critical?: boolean
          must_audit_lost?: boolean
          must_audit_sla_breach?: boolean
          must_review_critical?: boolean
          must_review_lost?: boolean
          must_review_low_confidence?: boolean
          must_review_sla_breach?: boolean
          playbook_items?: Json
          playbook_markdown?: string | null
          product_knowledge_base?: string | null
          profanity_keywords?: string[]
          sampling_enabled?: boolean
          sampling_new_seller_days?: number
          sampling_new_seller_percent?: number
          sampling_percent_per_seller?: number
          scoring_rubric?: string | null
          sla_breach_seconds?: number
          system_message_patterns?: string[]
          tone_categories?: Json
          updated_at?: string
        }
        Relationships: []
      }
      chatwoot_contact_match_log: {
        Row: {
          chatwoot_contact_id: number
          confidence: number | null
          created_at: string
          id: string
          matched_contact_id: string | null
          matched_opportunity_id: string | null
          method: string
          notes: string | null
        }
        Insert: {
          chatwoot_contact_id: number
          confidence?: number | null
          created_at?: string
          id?: string
          matched_contact_id?: string | null
          matched_opportunity_id?: string | null
          method: string
          notes?: string | null
        }
        Update: {
          chatwoot_contact_id?: number
          confidence?: number | null
          created_at?: string
          id?: string
          matched_contact_id?: string | null
          matched_opportunity_id?: string | null
          method?: string
          notes?: string | null
        }
        Relationships: []
      }
      chatwoot_contacts: {
        Row: {
          additional_attributes: Json
          additional_emails: string[]
          additional_phones: string[]
          chatwoot_account_id: number | null
          chatwoot_contact_id: number
          city: string | null
          company_name: string | null
          conversations_count: number
          country_code: string | null
          created_at: string
          created_at_chatwoot: string | null
          custom_attributes: Json
          email: string | null
          id: string
          identifier: string | null
          inbox_ids: number[]
          last_activity_at: string | null
          match_method: string | null
          matched_at: string | null
          matched_contact_id: string | null
          name: string | null
          phone_digits: string | null
          phone_e164: string | null
          raw: Json
          synced_at: string
          updated_at: string
        }
        Insert: {
          additional_attributes?: Json
          additional_emails?: string[]
          additional_phones?: string[]
          chatwoot_account_id?: number | null
          chatwoot_contact_id: number
          city?: string | null
          company_name?: string | null
          conversations_count?: number
          country_code?: string | null
          created_at?: string
          created_at_chatwoot?: string | null
          custom_attributes?: Json
          email?: string | null
          id?: string
          identifier?: string | null
          inbox_ids?: number[]
          last_activity_at?: string | null
          match_method?: string | null
          matched_at?: string | null
          matched_contact_id?: string | null
          name?: string | null
          phone_digits?: string | null
          phone_e164?: string | null
          raw?: Json
          synced_at?: string
          updated_at?: string
        }
        Update: {
          additional_attributes?: Json
          additional_emails?: string[]
          additional_phones?: string[]
          chatwoot_account_id?: number | null
          chatwoot_contact_id?: number
          city?: string | null
          company_name?: string | null
          conversations_count?: number
          country_code?: string | null
          created_at?: string
          created_at_chatwoot?: string | null
          custom_attributes?: Json
          email?: string | null
          id?: string
          identifier?: string | null
          inbox_ids?: number[]
          last_activity_at?: string | null
          match_method?: string | null
          matched_at?: string | null
          matched_contact_id?: string | null
          name?: string | null
          phone_digits?: string | null
          phone_e164?: string | null
          raw?: Json
          synced_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      chatwoot_conversation_audits: {
        Row: {
          ai_confidence: number | null
          analyzed_at: string
          assignee_email: string | null
          assignee_id: number | null
          assignee_name: string | null
          churn_risk_score: number
          churn_signals: Json
          competitor_mentions: Json
          compliance_flags: Json | null
          conversation_id: number
          conversation_resolved_at: string | null
          created_at: string
          human_notes: string | null
          human_overall_score: number | null
          human_reviewed_at: string | null
          human_reviewed_by: string | null
          human_severity: string | null
          id: string
          inbox_name: string | null
          message_count: number
          missed_opportunities: Json | null
          model_used: string | null
          overall_score: number
          override_reason: string | null
          playbook_checks: Json
          playbook_score: number
          review_notes: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          rubric_version_id: string | null
          run_id: string | null
          seller_seen_at: string | null
          sentiment_arc: Json | null
          severity: string
          sla_compliance: Json | null
          summary: string | null
          team_name: string | null
          technical_accuracy: Json | null
          tone_flags: Json
          tone_score: number
          transcript_hash: string | null
          updated_at: string
        }
        Insert: {
          ai_confidence?: number | null
          analyzed_at?: string
          assignee_email?: string | null
          assignee_id?: number | null
          assignee_name?: string | null
          churn_risk_score?: number
          churn_signals?: Json
          competitor_mentions?: Json
          compliance_flags?: Json | null
          conversation_id: number
          conversation_resolved_at?: string | null
          created_at?: string
          human_notes?: string | null
          human_overall_score?: number | null
          human_reviewed_at?: string | null
          human_reviewed_by?: string | null
          human_severity?: string | null
          id?: string
          inbox_name?: string | null
          message_count?: number
          missed_opportunities?: Json | null
          model_used?: string | null
          overall_score?: number
          override_reason?: string | null
          playbook_checks?: Json
          playbook_score?: number
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          rubric_version_id?: string | null
          run_id?: string | null
          seller_seen_at?: string | null
          sentiment_arc?: Json | null
          severity?: string
          sla_compliance?: Json | null
          summary?: string | null
          team_name?: string | null
          technical_accuracy?: Json | null
          tone_flags?: Json
          tone_score?: number
          transcript_hash?: string | null
          updated_at?: string
        }
        Update: {
          ai_confidence?: number | null
          analyzed_at?: string
          assignee_email?: string | null
          assignee_id?: number | null
          assignee_name?: string | null
          churn_risk_score?: number
          churn_signals?: Json
          competitor_mentions?: Json
          compliance_flags?: Json | null
          conversation_id?: number
          conversation_resolved_at?: string | null
          created_at?: string
          human_notes?: string | null
          human_overall_score?: number | null
          human_reviewed_at?: string | null
          human_reviewed_by?: string | null
          human_severity?: string | null
          id?: string
          inbox_name?: string | null
          message_count?: number
          missed_opportunities?: Json | null
          model_used?: string | null
          overall_score?: number
          override_reason?: string | null
          playbook_checks?: Json
          playbook_score?: number
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          rubric_version_id?: string | null
          run_id?: string | null
          seller_seen_at?: string | null
          sentiment_arc?: Json | null
          severity?: string
          sla_compliance?: Json | null
          summary?: string | null
          team_name?: string | null
          technical_accuracy?: Json | null
          tone_flags?: Json
          tone_score?: number
          transcript_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatwoot_conversation_audits_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "chatwoot_audit_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      chatwoot_conversations: {
        Row: {
          assignee_email: string | null
          assignee_id: number | null
          assignee_name: string | null
          chatwoot_account_id: number
          chatwoot_contact_id: number | null
          chatwoot_conversation_id: number
          chatwoot_inbox_id: number | null
          contact_email: string | null
          contact_id: string | null
          contact_name: string | null
          contact_phone: string | null
          conversation_closed_at: string | null
          created_at: string
          first_contact_message_at: string | null
          first_response_at: string | null
          inbox_name: string | null
          labels: string[]
          last_message_at: string | null
          opened_at: string | null
          opportunity_id: string | null
          status: string
          tabulacao_atendimento: string | null
          team_id: number | null
          team_name: string | null
          tm1r_seconds: number | null
          updated_at: string
        }
        Insert: {
          assignee_email?: string | null
          assignee_id?: number | null
          assignee_name?: string | null
          chatwoot_account_id: number
          chatwoot_contact_id?: number | null
          chatwoot_conversation_id: number
          chatwoot_inbox_id?: number | null
          contact_email?: string | null
          contact_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          conversation_closed_at?: string | null
          created_at?: string
          first_contact_message_at?: string | null
          first_response_at?: string | null
          inbox_name?: string | null
          labels?: string[]
          last_message_at?: string | null
          opened_at?: string | null
          opportunity_id?: string | null
          status?: string
          tabulacao_atendimento?: string | null
          team_id?: number | null
          team_name?: string | null
          tm1r_seconds?: number | null
          updated_at?: string
        }
        Update: {
          assignee_email?: string | null
          assignee_id?: number | null
          assignee_name?: string | null
          chatwoot_account_id?: number
          chatwoot_contact_id?: number | null
          chatwoot_conversation_id?: number
          chatwoot_inbox_id?: number | null
          contact_email?: string | null
          contact_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          conversation_closed_at?: string | null
          created_at?: string
          first_contact_message_at?: string | null
          first_response_at?: string | null
          inbox_name?: string | null
          labels?: string[]
          last_message_at?: string | null
          opened_at?: string | null
          opportunity_id?: string | null
          status?: string
          tabulacao_atendimento?: string | null
          team_id?: number | null
          team_name?: string | null
          tm1r_seconds?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      chatwoot_messages: {
        Row: {
          chatwoot_account_id: number | null
          chatwoot_conversation_id: number
          chatwoot_inbox_id: number | null
          chatwoot_message_id: number
          content_preview: string | null
          created_at: string
          id: string
          inbox_name: string | null
          is_private: boolean
          message_created_at: string
          message_type: number | null
          sender_email: string | null
          sender_id: number | null
          sender_name: string | null
          sender_type: string
        }
        Insert: {
          chatwoot_account_id?: number | null
          chatwoot_conversation_id: number
          chatwoot_inbox_id?: number | null
          chatwoot_message_id: number
          content_preview?: string | null
          created_at?: string
          id?: string
          inbox_name?: string | null
          is_private?: boolean
          message_created_at: string
          message_type?: number | null
          sender_email?: string | null
          sender_id?: number | null
          sender_name?: string | null
          sender_type: string
        }
        Update: {
          chatwoot_account_id?: number | null
          chatwoot_conversation_id?: number
          chatwoot_inbox_id?: number | null
          chatwoot_message_id?: number
          content_preview?: string | null
          created_at?: string
          id?: string
          inbox_name?: string | null
          is_private?: boolean
          message_created_at?: string
          message_type?: number | null
          sender_email?: string | null
          sender_id?: number | null
          sender_name?: string | null
          sender_type?: string
        }
        Relationships: []
      }
      commission_products: {
        Row: {
          area: string | null
          commission_base: string
          commission_percent: number
          created_at: string
          id: string
          name: string
          periodicity: string
          plan_mrr: number
          plan_name: string
          plan_value: number
          price_name: string | null
          product_id: string | null
          seller_id: string | null
          stripe_price_id: string | null
          updated_at: string
        }
        Insert: {
          area?: string | null
          commission_base?: string
          commission_percent?: number
          created_at?: string
          id?: string
          name: string
          periodicity?: string
          plan_mrr?: number
          plan_name?: string
          plan_value?: number
          price_name?: string | null
          product_id?: string | null
          seller_id?: string | null
          stripe_price_id?: string | null
          updated_at?: string
        }
        Update: {
          area?: string | null
          commission_base?: string
          commission_percent?: number
          created_at?: string
          id?: string
          name?: string
          periodicity?: string
          plan_mrr?: number
          plan_name?: string
          plan_value?: number
          price_name?: string | null
          product_id?: string | null
          seller_id?: string | null
          stripe_price_id?: string | null
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
          ac_id: string | null
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
          ac_id?: string | null
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
          ac_id?: string | null
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
      discount_clients: {
        Row: {
          cnpj: string | null
          company_name: string
          created_at: string
          cs_user_id: string | null
          embedded_software_value: number
          id: string
          is_active: boolean
          opportunity_id: string | null
          plan_type: Database["public"]["Enums"]["discount_plan_type"]
          saas_base_price: number
          saas_plan_name: string
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          company_name: string
          created_at?: string
          cs_user_id?: string | null
          embedded_software_value?: number
          id?: string
          is_active?: boolean
          opportunity_id?: string | null
          plan_type?: Database["public"]["Enums"]["discount_plan_type"]
          saas_base_price?: number
          saas_plan_name?: string
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          company_name?: string
          created_at?: string
          cs_user_id?: string | null
          embedded_software_value?: number
          id?: string
          is_active?: boolean
          opportunity_id?: string | null
          plan_type?: Database["public"]["Enums"]["discount_plan_type"]
          saas_base_price?: number
          saas_plan_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      discount_tiers: {
        Row: {
          created_at: string
          discount_value: number
          id: string
          is_active: boolean
          name: string
          position: number
          tpv_max: number | null
          tpv_min: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          name: string
          position?: number
          tpv_max?: number | null
          tpv_min: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          name?: string
          position?: number
          tpv_max?: number | null
          tpv_min?: number
          updated_at?: string
        }
        Relationships: []
      }
      finance_settings: {
        Row: {
          avg_campaign_cost: number
          avg_churn_rate: number
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          avg_campaign_cost?: number
          avg_churn_rate?: number
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          avg_campaign_cost?: number
          avg_churn_rate?: number
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      goal_categories: {
        Row: {
          area: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          metric_type: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          area: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          metric_type?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          area?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          metric_type?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          campaign: string | null
          category_id: string | null
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
          category_id?: string | null
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
          category_id?: string | null
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
      integration_settings: {
        Row: {
          ac_account_url: string | null
          ac_webhook_secret: string | null
          chatwoot_account_id: number | null
          chatwoot_base_url: string | null
          chatwoot_last_event_at: string | null
          chatwoot_webhook_secret: string | null
          created_at: string
          id: string
          last_full_sync_at: string | null
          sync_log: Json | null
          sync_status: string | null
          updated_at: string
        }
        Insert: {
          ac_account_url?: string | null
          ac_webhook_secret?: string | null
          chatwoot_account_id?: number | null
          chatwoot_base_url?: string | null
          chatwoot_last_event_at?: string | null
          chatwoot_webhook_secret?: string | null
          created_at?: string
          id?: string
          last_full_sync_at?: string | null
          sync_log?: Json | null
          sync_status?: string | null
          updated_at?: string
        }
        Update: {
          ac_account_url?: string | null
          ac_webhook_secret?: string | null
          chatwoot_account_id?: number | null
          chatwoot_base_url?: string | null
          chatwoot_last_event_at?: string | null
          chatwoot_webhook_secret?: string | null
          created_at?: string
          id?: string
          last_full_sync_at?: string | null
          sync_log?: Json | null
          sync_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      integration_sync_errors: {
        Row: {
          ac_id: string | null
          created_at: string
          entity_type: string
          error_message: string
          id: string
          payload: Json | null
          resolved: boolean
        }
        Insert: {
          ac_id?: string | null
          created_at?: string
          entity_type: string
          error_message: string
          id?: string
          payload?: Json | null
          resolved?: boolean
        }
        Update: {
          ac_id?: string | null
          created_at?: string
          entity_type?: string
          error_message?: string
          id?: string
          payload?: Json | null
          resolved?: boolean
        }
        Relationships: []
      }
      invoice_log: {
        Row: {
          client_id: string
          created_at: string
          discount_applied: number
          final_value: number
          id: string
          original_value: number
          processed_at: string
          processed_by: string | null
          reference_month: string
          tier_id: string | null
          tpv_amount: number
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          discount_applied?: number
          final_value?: number
          id?: string
          original_value?: number
          processed_at?: string
          processed_by?: string | null
          reference_month: string
          tier_id?: string | null
          tpv_amount?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          discount_applied?: number
          final_value?: number
          id?: string
          original_value?: number
          processed_at?: string
          processed_by?: string | null
          reference_month?: string
          tier_id?: string | null
          tpv_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "discount_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_log_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "discount_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_import_rows: {
        Row: {
          created_at: string
          cw_conversation_ids: number[]
          cw_customer_replied: boolean
          cw_first_agent_email: string | null
          cw_first_agent_name: string | null
          cw_first_contact_at: string | null
          cw_last_label: string | null
          cw_last_status: string | null
          cw_match_method: string | null
          cw_total_conversations: number
          cw_total_messages: number
          extra: Json
          hours_to_first_contact: number | null
          id: string
          import_id: string
          lead_campaign: string | null
          lead_created_at: string | null
          lead_email: string | null
          lead_name: string | null
          lead_origin: string | null
          lead_phone_normalized: string | null
          lead_phone_raw: string | null
          row_index: number
          sla_bucket: string | null
          stripe_converted_at: string | null
          stripe_mrr: number
          stripe_paying: boolean
          stripe_plan: string | null
        }
        Insert: {
          created_at?: string
          cw_conversation_ids?: number[]
          cw_customer_replied?: boolean
          cw_first_agent_email?: string | null
          cw_first_agent_name?: string | null
          cw_first_contact_at?: string | null
          cw_last_label?: string | null
          cw_last_status?: string | null
          cw_match_method?: string | null
          cw_total_conversations?: number
          cw_total_messages?: number
          extra?: Json
          hours_to_first_contact?: number | null
          id?: string
          import_id: string
          lead_campaign?: string | null
          lead_created_at?: string | null
          lead_email?: string | null
          lead_name?: string | null
          lead_origin?: string | null
          lead_phone_normalized?: string | null
          lead_phone_raw?: string | null
          row_index: number
          sla_bucket?: string | null
          stripe_converted_at?: string | null
          stripe_mrr?: number
          stripe_paying?: boolean
          stripe_plan?: string | null
        }
        Update: {
          created_at?: string
          cw_conversation_ids?: number[]
          cw_customer_replied?: boolean
          cw_first_agent_email?: string | null
          cw_first_agent_name?: string | null
          cw_first_contact_at?: string | null
          cw_last_label?: string | null
          cw_last_status?: string | null
          cw_match_method?: string | null
          cw_total_conversations?: number
          cw_total_messages?: number
          extra?: Json
          hours_to_first_contact?: number | null
          id?: string
          import_id?: string
          lead_campaign?: string | null
          lead_created_at?: string | null
          lead_email?: string | null
          lead_name?: string | null
          lead_origin?: string | null
          lead_phone_normalized?: string | null
          lead_phone_raw?: string | null
          row_index?: number
          sla_bucket?: string | null
          stripe_converted_at?: string | null
          stripe_mrr?: number
          stripe_paying?: boolean
          stripe_plan?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_import_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "lead_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_imports: {
        Row: {
          column_mapping: Json
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          matched_chatwoot: number
          matched_paying: number
          name: string
          source_file_name: string | null
          status: string
          total_rows: number
          updated_at: string
        }
        Insert: {
          column_mapping?: Json
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          matched_chatwoot?: number
          matched_paying?: number
          name: string
          source_file_name?: string | null
          status?: string
          total_rows?: number
          updated_at?: string
        }
        Update: {
          column_mapping?: Json
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          matched_chatwoot?: number
          matched_paying?: number
          name?: string
          source_file_name?: string | null
          status?: string
          total_rows?: number
          updated_at?: string
        }
        Relationships: []
      }
      opportunities: {
        Row: {
          ac_id: string | null
          ac_stage_changed_at: string | null
          attribution: Database["public"]["Enums"]["attribution_model"] | null
          billing_type: string
          cancellation_date: string | null
          category_id: string | null
          closed_at: string | null
          company: string | null
          consultant_id: string | null
          contact_id: string | null
          converted_at: string | null
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
          opportunity_created_at: string | null
          origin: Database["public"]["Enums"]["lead_origin"]
          phone: string | null
          pipeline_id: string | null
          previous_stage: string | null
          probability: number | null
          product_id: string | null
          stage: string
          stripe_customer_id: string | null
          stripe_pending_since: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          sub_origin: string | null
          take_rate: number | null
          title: string | null
          updated_at: string
        }
        Insert: {
          ac_id?: string | null
          ac_stage_changed_at?: string | null
          attribution?: Database["public"]["Enums"]["attribution_model"] | null
          billing_type?: string
          cancellation_date?: string | null
          category_id?: string | null
          closed_at?: string | null
          company?: string | null
          consultant_id?: string | null
          contact_id?: string | null
          converted_at?: string | null
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
          opportunity_created_at?: string | null
          origin?: Database["public"]["Enums"]["lead_origin"]
          phone?: string | null
          pipeline_id?: string | null
          previous_stage?: string | null
          probability?: number | null
          product_id?: string | null
          stage?: string
          stripe_customer_id?: string | null
          stripe_pending_since?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          sub_origin?: string | null
          take_rate?: number | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          ac_id?: string | null
          ac_stage_changed_at?: string | null
          attribution?: Database["public"]["Enums"]["attribution_model"] | null
          billing_type?: string
          cancellation_date?: string | null
          category_id?: string | null
          closed_at?: string | null
          company?: string | null
          consultant_id?: string | null
          contact_id?: string | null
          converted_at?: string | null
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
          opportunity_created_at?: string | null
          origin?: Database["public"]["Enums"]["lead_origin"]
          phone?: string | null
          pipeline_id?: string | null
          previous_stage?: string | null
          probability?: number | null
          product_id?: string | null
          stage?: string
          stripe_customer_id?: string | null
          stripe_pending_since?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
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
      opportunity_tags: {
        Row: {
          created_at: string
          created_by: string | null
          opportunity_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          opportunity_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          opportunity_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_tags_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          ac_id: string | null
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
          ac_id?: string | null
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
          ac_id?: string | null
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
          ac_id: string | null
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          ac_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          ac_id?: string | null
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
      sales_campaign_contacts: {
        Row: {
          ac_last_stage: string | null
          ac_last_stage_at: string | null
          ac_synced_at: string | null
          campaign_id: string
          company: string | null
          created_at: string
          cw_first_contact_at: string | null
          email: string | null
          email_norm: string | null
          extra: Json
          handled_by_human: boolean
          handled_by_ia: boolean
          ia_source: string | null
          id: string
          last_touch_at: string | null
          match_method: string | null
          matched_ac_deal_id: string | null
          matched_chatwoot_contact_id: number | null
          matched_contact_id: string | null
          matched_opportunity_id: string | null
          mrr_generated: number
          name: string | null
          notes: string | null
          ops_contacted: boolean
          ops_contacted_at: string | null
          ops_contacted_by: string | null
          ops_notes: string | null
          phone: string | null
          phone_digits: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ac_last_stage?: string | null
          ac_last_stage_at?: string | null
          ac_synced_at?: string | null
          campaign_id: string
          company?: string | null
          created_at?: string
          cw_first_contact_at?: string | null
          email?: string | null
          email_norm?: string | null
          extra?: Json
          handled_by_human?: boolean
          handled_by_ia?: boolean
          ia_source?: string | null
          id?: string
          last_touch_at?: string | null
          match_method?: string | null
          matched_ac_deal_id?: string | null
          matched_chatwoot_contact_id?: number | null
          matched_contact_id?: string | null
          matched_opportunity_id?: string | null
          mrr_generated?: number
          name?: string | null
          notes?: string | null
          ops_contacted?: boolean
          ops_contacted_at?: string | null
          ops_contacted_by?: string | null
          ops_notes?: string | null
          phone?: string | null
          phone_digits?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ac_last_stage?: string | null
          ac_last_stage_at?: string | null
          ac_synced_at?: string | null
          campaign_id?: string
          company?: string | null
          created_at?: string
          cw_first_contact_at?: string | null
          email?: string | null
          email_norm?: string | null
          extra?: Json
          handled_by_human?: boolean
          handled_by_ia?: boolean
          ia_source?: string | null
          id?: string
          last_touch_at?: string | null
          match_method?: string | null
          matched_ac_deal_id?: string | null
          matched_chatwoot_contact_id?: number | null
          matched_contact_id?: string | null
          matched_opportunity_id?: string | null
          mrr_generated?: number
          name?: string | null
          notes?: string | null
          ops_contacted?: boolean
          ops_contacted_at?: string | null
          ops_contacted_by?: string | null
          ops_notes?: string | null
          phone?: string | null
          phone_digits?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_campaign_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sales_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_campaign_imports: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string | null
          error_message: string | null
          file_name: string | null
          id: string
          inserted_rows: number
          mapping: Json
          skipped_rows: number
          status: string
          total_rows: number
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          file_name?: string | null
          id?: string
          inserted_rows?: number
          mapping?: Json
          skipped_rows?: number
          status?: string
          total_rows?: number
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          file_name?: string | null
          id?: string
          inserted_rows?: number
          mapping?: Json
          skipped_rows?: number
          status?: string
          total_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_campaign_imports_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sales_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_campaign_snapshots: {
        Row: {
          campaign_id: string
          contacted: number
          conversions: number
          created_at: string
          created_by: string | null
          handled_by: string
          id: string
          meetings: number
          mrr_generated: number
          notes: string | null
          replies: number
          snapshot_date: string
          source: string
        }
        Insert: {
          campaign_id: string
          contacted?: number
          conversions?: number
          created_at?: string
          created_by?: string | null
          handled_by?: string
          id?: string
          meetings?: number
          mrr_generated?: number
          notes?: string | null
          replies?: number
          snapshot_date?: string
          source?: string
        }
        Update: {
          campaign_id?: string
          contacted?: number
          conversions?: number
          created_at?: string
          created_by?: string | null
          handled_by?: string
          id?: string
          meetings?: number
          mrr_generated?: number
          notes?: string | null
          replies?: number
          snapshot_date?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_campaign_snapshots_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sales_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_campaigns: {
        Row: {
          area: string | null
          budget: number
          channel: string
          churn_rate: number | null
          created_at: string
          created_by: string | null
          custom_field_defs: Json
          description: string | null
          end_date: string | null
          funnel_stages: Json
          id: string
          name: string
          owner_id: string | null
          priority: number
          segment: string | null
          start_date: string | null
          status: string
          target_contacted: number
          target_conversions: number
          target_mrr: number
          target_replies: number
          updated_at: string
        }
        Insert: {
          area?: string | null
          budget?: number
          channel?: string
          churn_rate?: number | null
          created_at?: string
          created_by?: string | null
          custom_field_defs?: Json
          description?: string | null
          end_date?: string | null
          funnel_stages?: Json
          id?: string
          name: string
          owner_id?: string | null
          priority?: number
          segment?: string | null
          start_date?: string | null
          status?: string
          target_contacted?: number
          target_conversions?: number
          target_mrr?: number
          target_replies?: number
          updated_at?: string
        }
        Update: {
          area?: string | null
          budget?: number
          channel?: string
          churn_rate?: number | null
          created_at?: string
          created_by?: string | null
          custom_field_defs?: Json
          description?: string | null
          end_date?: string | null
          funnel_stages?: Json
          id?: string
          name?: string
          owner_id?: string | null
          priority?: number
          segment?: string | null
          start_date?: string | null
          status?: string
          target_contacted?: number
          target_conversions?: number
          target_mrr?: number
          target_replies?: number
          updated_at?: string
        }
        Relationships: []
      }
      stripe_conversions: {
        Row: {
          area: string
          converted_at: string
          created_at: string
          customer_email: string | null
          id: string
          matched_contact_id: string | null
          matched_opportunity_id: string | null
          mrr: number
          plan_name: string | null
          product_name: string | null
          registered_at: string | null
          stripe_customer_id: string | null
          stripe_event_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          area?: string
          converted_at?: string
          created_at?: string
          customer_email?: string | null
          id?: string
          matched_contact_id?: string | null
          matched_opportunity_id?: string | null
          mrr?: number
          plan_name?: string | null
          product_name?: string | null
          registered_at?: string | null
          stripe_customer_id?: string | null
          stripe_event_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          area?: string
          converted_at?: string
          created_at?: string
          customer_email?: string | null
          id?: string
          matched_contact_id?: string | null
          matched_opportunity_id?: string | null
          mrr?: number
          plan_name?: string | null
          product_name?: string | null
          registered_at?: string | null
          stripe_customer_id?: string | null
          stripe_event_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          event_type: string
          id: string
          matched_opportunity_id: string | null
          payload: Json
          processed_at: string
          result: string | null
          stripe_event_id: string
        }
        Insert: {
          event_type: string
          id?: string
          matched_opportunity_id?: string | null
          payload?: Json
          processed_at?: string
          result?: string | null
          stripe_event_id: string
        }
        Update: {
          event_type?: string
          id?: string
          matched_opportunity_id?: string | null
          payload?: Json
          processed_at?: string
          result?: string | null
          stripe_event_id?: string
        }
        Relationships: []
      }
      stripe_prices: {
        Row: {
          area: string | null
          commission_percent: number
          commission_product_id: string | null
          commission_value: number
          created_at: string
          id: string
          mrr: number
          plan_name: string
          price_id: string
          price_name: string
          product_name: string
          seller_id: string | null
          updated_at: string
        }
        Insert: {
          area?: string | null
          commission_percent?: number
          commission_product_id?: string | null
          commission_value?: number
          created_at?: string
          id?: string
          mrr?: number
          plan_name: string
          price_id: string
          price_name?: string
          product_name: string
          seller_id?: string | null
          updated_at?: string
        }
        Update: {
          area?: string | null
          commission_percent?: number
          commission_product_id?: string | null
          commission_value?: number
          created_at?: string
          id?: string
          mrr?: number
          plan_name?: string
          price_id?: string
          price_name?: string
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
      tags: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
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
      tpv_monthly: {
        Row: {
          client_id: string
          created_at: string
          id: string
          reference_month: string
          sync_status: string
          synced_at: string | null
          tpv_amount: number
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          reference_month: string
          sync_status?: string
          synced_at?: string | null
          tpv_amount?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          reference_month?: string
          sync_status?: string
          synced_at?: string | null
          tpv_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tpv_monthly_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "discount_clients"
            referencedColumns: ["id"]
          },
        ]
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
      calculate_discount: {
        Args: {
          p_base_price: number
          p_embedded_value: number
          p_plan_type: Database["public"]["Enums"]["discount_plan_type"]
          p_tpv: number
        }
        Returns: Json
      }
      get_chatwoot_labels: { Args: never; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_tatico_or_admin: { Args: { _user_id: string }; Returns: boolean }
      normalize_phone_digits: { Args: { p_phone: string }; Returns: string }
      scc_compute_first_contact_for: {
        Args: { p_email: string; p_phone: string }
        Returns: string
      }
      scc_compute_tag_funnel: {
        Args: { p_campaign_id: string }
        Returns: {
          contact_count: number
          contact_ids: string[]
          mrr_total: number
          stage_id: string
        }[]
      }
      scc_list_campaign_tags: {
        Args: { p_campaign_id: string }
        Returns: {
          tag: string
          usage_count: number
        }[]
      }
      scc_refresh_first_contact: {
        Args: { p_campaign_id: string }
        Returns: number
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
        | "chatwoot_status_change"
      app_role: "admin" | "seller" | "tatico"
      attribution_model: "first_click" | "last_click"
      commission_status: "provisioned" | "paid" | "reversed"
      commission_type: "earned" | "clawback"
      discount_plan_type: "software" | "consultoria_bpo"
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
        "chatwoot_status_change",
      ],
      app_role: ["admin", "seller", "tatico"],
      attribution_model: ["first_click", "last_click"],
      commission_status: ["provisioned", "paid", "reversed"],
      commission_type: ["earned", "clawback"],
      discount_plan_type: ["software", "consultoria_bpo"],
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
