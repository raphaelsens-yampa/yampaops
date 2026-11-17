CREATE TABLE public.cs_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_email text NOT NULL,
  client_name text,
  portfolio_id uuid,
  title text NOT NULL,
  description text,
  task_type text NOT NULL DEFAULT 'follow_up',
  priority text NOT NULL DEFAULT 'media',
  status text NOT NULL DEFAULT 'pendente',
  due_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  assigned_to uuid NOT NULL DEFAULT auth.uid(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_tasks TO authenticated;
GRANT ALL ON public.cs_tasks TO service_role;
ALTER TABLE public.cs_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal read tasks" ON public.cs_tasks FOR SELECT TO authenticated USING (public.is_internal_user(auth.uid()));
CREATE POLICY "internal create tasks" ON public.cs_tasks FOR INSERT TO authenticated WITH CHECK (public.is_internal_user(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "owner update tasks" ON public.cs_tasks FOR UPDATE TO authenticated USING (public.is_internal_user(auth.uid()) AND (created_by = auth.uid() OR assigned_to = auth.uid() OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "owner delete tasks" ON public.cs_tasks FOR DELETE TO authenticated USING (public.is_internal_user(auth.uid()) AND (created_by = auth.uid() OR assigned_to = auth.uid() OR public.has_role(auth.uid(),'admin')));
CREATE TRIGGER cs_tasks_updated BEFORE UPDATE ON public.cs_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX cs_tasks_assigned_due ON public.cs_tasks(assigned_to, due_at);
CREATE INDEX cs_tasks_email ON public.cs_tasks(client_email);