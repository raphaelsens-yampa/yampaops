CREATE POLICY "Tatico delete sales_campaigns" ON public.sales_campaigns
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'tatico'::app_role));