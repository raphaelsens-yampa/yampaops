create or replace function public.get_chatwoot_labels()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct l order by l), '{}')
  from chatwoot_conversations c, unnest(c.labels) as l
  where (public.has_role(auth.uid(), 'admin'::app_role) or public.has_role(auth.uid(), 'tatico'::app_role))
    and l is not null and l <> '';
$$;

revoke all on function public.get_chatwoot_labels() from public;
grant execute on function public.get_chatwoot_labels() to authenticated;