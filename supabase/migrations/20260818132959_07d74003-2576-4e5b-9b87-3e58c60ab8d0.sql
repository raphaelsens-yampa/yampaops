ALTER TABLE public.ac_funnel_deals ADD COLUMN IF NOT EXISTS loss_reason text;

CREATE TABLE IF NOT EXISTS public.ac_funnel_deal_tasks (
  ac_task_id text PRIMARY KEY,
  ac_deal_id text NOT NULL,
  ac_group_id text NOT NULL,
  ac_stage_id text,
  title text,
  task_type_id text,
  task_type text,
  assignee_id text,
  owner_name text,
  due_date timestamptz,
  is_done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ac_funnel_deal_tasks TO authenticated;
GRANT ALL ON public.ac_funnel_deal_tasks TO service_role;
ALTER TABLE public.ac_funnel_deal_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ac_funnel_deal_tasks_read_managers"
ON public.ac_funnel_deal_tasks FOR SELECT TO authenticated
USING (public.is_tatico_or_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_ac_funnel_deal_tasks_group ON public.ac_funnel_deal_tasks (ac_group_id);
CREATE INDEX IF NOT EXISTS idx_ac_funnel_deal_tasks_deal ON public.ac_funnel_deal_tasks (ac_deal_id);