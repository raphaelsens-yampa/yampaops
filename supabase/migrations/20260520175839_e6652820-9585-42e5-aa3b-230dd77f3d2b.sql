delete from public.sales_campaign_contacts
where extra->>'source' = 'chatwoot_tag_sync';