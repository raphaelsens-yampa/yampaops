
# Yampa — SaaS Sales Performance & Projection Manager

## Overview
A comprehensive sales CRM for a fintech SaaS, featuring multi-channel pipeline management, seller productivity tracking, and revenue forecasting. Two views: **Admin Dashboard** (gerencial) and **Seller View** (vendedor). Colors: Azul (#01B8E0), Roxo (#2D094C), Branco (#FAFAFA). Typography: Sora headings, Manrope body. Light/dark mode.

---

## Phase 1: Database & Auth Setup

### Authentication (Lovable Cloud)
- Email/password auth with login/signup pages
- User roles table: `admin` and `seller` roles
- Profile table with `full_name`, `avatar_url`, `role`
- RLS policies scoping sellers to their own data, admins to everything

### Database Schema
- **leads** — `id`, `name`, `company`, `origin` (enum: freetrial, cursos, outbound, campanhas, base), `consultant_id` (FK profiles), `stage` (enum: novo_lead, contato_realizado, diagnostico, proposta_enviada, negociacao, fechado_won, perdido), `estimated_mrr`, `estimated_tpv`, `take_rate`, `attribution_model` (first_click/last_click), `created_at`, `last_interaction_at`, `notes`
- **activities** — `id`, `lead_id` (FK), `user_id` (FK), `type` (enum: mensagem_enviada, resposta_recebida, call_realizada, reuniao_executada), `notes`, `created_at`
- **goals** — `id`, `user_id` (FK, nullable for channel-level goals), `channel` (origin enum), `period_start`, `period_end`, `target_mrr`, `target_deals`, `target_tpv`
- RLS: sellers see only their leads/activities; admins see all

---

## Phase 2: Admin Dashboard

### Top Metrics Bar
- Total Pipeline MRR, Closed Won MRR (month), Conversion Rate, Sales Velocity (avg cycle days), Active Leads count

### Pipeline Funnel Chart
- Visual funnel showing lead count and value per stage
- Filter by channel (origin) and date range
- Conversion % between each stage pair

### Goals vs Actual
- Progress bars showing MRR achieved vs target, by channel and overall
- Gap to Goal calculation with probability estimate based on current pipeline weighted by stage

### Leaderboard
- Table ranking sellers by: deals closed, MRR won, contacts made, meetings booked
- Sparkline for weekly trend

### Bottleneck Alerts
- List of leads stagnated >48h in any stage, with seller name and days stuck
- Color-coded urgency

### Sales Velocity by Channel
- Average cycle time (days) per channel, shown as bar chart
- Highlights channels that are slower than average

---

## Phase 3: Seller View

### Kanban Board
- Drag-and-drop columns for each pipeline stage
- Cards show lead name, company, MRR, days in stage
- Quick actions: change stage, add note, log activity

### Daily Checklist
- Auto-generated list of leads needing follow-up (no interaction in 24h+)
- Checkbox to mark as contacted, which logs an activity

### Quick Input
- Inline status change and note-adding from the kanban card
- Activity logging modal (type + notes)

### Personal Goals Widget
- My MRR target vs closed, deals target vs closed
- Gap to Goal with simple projection

---

## Phase 4: Forecasting Module

### Gap to Goal Calculator
- Per seller and per channel
- Weighted pipeline: each stage has a probability weight (e.g., Proposta = 50%, Negociação = 75%)
- Shows: target − closed = gap, weighted pipeline value, likelihood of hitting goal

### Revenue Projection
- Combines software MRR + estimated TPV × take rate for total projected revenue
- Monthly projection chart

---

## Phase 5: Data Management

### CSV Import
- Upload CSV (Metabase export), map columns to lead fields
- Preview and confirm before importing
- Duplicate detection by company + name

### Manual Override
- Edit any lead field directly (for CRM sync gaps)
- Override log showing what was changed and when

### Export
- Export filtered lead data and closing reports as CSV
- Date range and channel filters

---

## Design System
- **Colors**: Primary Azul (#01B8E0), Secondary Roxo (#2D094C), Background light (#FAFAFA) / dark mode
- **Typography**: Sora for headings, Manrope for body
- **Layout**: Sidebar navigation (Dashboard style) with collapsible menu
- **Components**: shadcn/ui with custom theme tokens
- Dark/light mode toggle in header
