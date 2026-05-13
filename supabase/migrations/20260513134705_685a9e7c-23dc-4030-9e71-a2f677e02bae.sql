ALTER TABLE public.sales_campaign_snapshots REPLICA IDENTITY FULL;
ALTER TABLE public.sales_campaign_contacts REPLICA IDENTITY FULL;
ALTER TABLE public.sales_campaigns REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_campaign_snapshots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_campaign_contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_campaigns;