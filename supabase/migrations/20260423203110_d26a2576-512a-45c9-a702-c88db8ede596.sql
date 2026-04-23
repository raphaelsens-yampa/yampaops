-- Drop partial unique indexes and replace with full unique indexes (NULLs are distinct by default)
DROP INDEX IF EXISTS public.pipelines_ac_id_key;
DROP INDEX IF EXISTS public.pipeline_stages_ac_id_key;
DROP INDEX IF EXISTS public.contacts_ac_id_key;
DROP INDEX IF EXISTS public.opportunities_ac_id_key;
DROP INDEX IF EXISTS public.activities_ac_id_key;

CREATE UNIQUE INDEX pipelines_ac_id_key ON public.pipelines (ac_id);
CREATE UNIQUE INDEX pipeline_stages_ac_id_key ON public.pipeline_stages (ac_id);
CREATE UNIQUE INDEX contacts_ac_id_key ON public.contacts (ac_id);
CREATE UNIQUE INDEX opportunities_ac_id_key ON public.opportunities (ac_id);
CREATE UNIQUE INDEX activities_ac_id_key ON public.activities (ac_id);