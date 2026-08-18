CREATE TABLE public.tactical_recovery_reasons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  channel text NOT NULL DEFAULT 'ambos' CHECK (channel IN ('cobranca','cs','ambos')),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tactical_recovery_reasons TO authenticated;
GRANT ALL ON public.tactical_recovery_reasons TO service_role;

ALTER TABLE public.tactical_recovery_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view recovery reasons"
ON public.tactical_recovery_reasons FOR SELECT TO authenticated USING (true);

CREATE POLICY "Tatico or admin can manage recovery reasons"
ON public.tactical_recovery_reasons FOR ALL TO authenticated
USING (public.is_tatico_or_admin(auth.uid()))
WITH CHECK (public.is_tatico_or_admin(auth.uid()));

ALTER TABLE public.tactical_recoveries
  ADD COLUMN recovery_channel text NOT NULL DEFAULT 'cs' CHECK (recovery_channel IN ('cobranca','cs')),
  ADD COLUMN reason_id uuid REFERENCES public.tactical_recovery_reasons(id) ON DELETE SET NULL;

ALTER TABLE public.tactical_manual_entries
  ADD COLUMN recovery_channel text CHECK (recovery_channel IN ('cobranca','cs')),
  ADD COLUMN reason_id uuid REFERENCES public.tactical_recovery_reasons(id) ON DELETE SET NULL;

INSERT INTO public.tactical_recovery_reasons (name, channel, sort_order) VALUES
  ('Cobrança recuperada na retentativa', 'cobranca', 10),
  ('Cartão atualizado', 'cobranca', 20),
  ('Boleto/Pix pago após lembrete', 'cobranca', 30),
  ('Renegociação de valor', 'cs', 40),
  ('Desconto concedido', 'cs', 50),
  ('Problema técnico resolvido', 'cs', 60),
  ('Onboarding/uso retomado', 'cs', 70),
  ('Mudança de plano', 'ambos', 80),
  ('Outro', 'ambos', 999);