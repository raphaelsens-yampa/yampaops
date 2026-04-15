
ALTER TABLE public.goals
  ADD COLUMN target_prospeccoes integer DEFAULT 0,
  ADD COLUMN target_respostas integer DEFAULT 0,
  ADD COLUMN target_agendamentos integer DEFAULT 0,
  ADD COLUMN target_comparecimentos integer DEFAULT 0,
  ADD COLUMN target_conversoes integer DEFAULT 0,
  ADD COLUMN target_taxa_resposta numeric DEFAULT NULL,
  ADD COLUMN target_taxa_agendamento numeric DEFAULT NULL,
  ADD COLUMN target_taxa_comparecimento numeric DEFAULT NULL,
  ADD COLUMN target_taxa_conversao numeric DEFAULT NULL;
