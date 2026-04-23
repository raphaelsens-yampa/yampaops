-- Helper function: is user tatico OR admin (for broad view permissions)
CREATE OR REPLACE FUNCTION public.is_tatico_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'tatico')
  )
$$;

-- Opportunities: allow tatico to SELECT all
CREATE POLICY "Tatico view all opportunities"
ON public.opportunities
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'tatico'));

-- Activities: allow tatico to SELECT all
CREATE POLICY "Tatico view all activities"
ON public.activities
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'tatico'));

-- Goals: allow tatico to SELECT all
CREATE POLICY "Tatico view all goals"
ON public.goals
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'tatico'));

-- Commissions: allow tatico to SELECT all
CREATE POLICY "Tatico view all commissions"
ON public.commissions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'tatico'));

-- Contacts: allow tatico to SELECT all
CREATE POLICY "Tatico view all contacts"
ON public.contacts
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'tatico'));