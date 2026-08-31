import { useMemo, useState } from "react";
import { useTacticalData } from "./useTacticalData";
import { useRecoveryReasons } from "./recoveryChannels";
import { StripeBackupPanel } from "./StripeBackupPanel";
import { TacticalGoalsManager } from "./TacticalGoalsManager";
import { RecoveryReasonsConfig } from "./RecoveryReasonsConfig";
import { CampaignCouponsConfig } from "./CampaignCouponsConfig";

/**
 * Agrupa as configurações do módulo tático (backup do Stripe, metas diárias e
 * motivos de recuperação/retenção) fora da aba de acompanhamento.
 */
export function TacticalSettingsPanel() {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const rangeStart = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() - 89); return d; }, [today]);
  // Metas futuras (ex.: cadastradas para o próximo mês) precisam aparecer na tabela,
  // por isso a janela de consulta avança 12 meses além de hoje.
  const rangeEnd = useMemo(() => { const d = new Date(today); d.setMonth(d.getMonth() + 12); return d; }, [today]);
  const [reloadKey, setReloadKey] = useState(0);
  const { metrics, goals, profiles, teams, loading } = useTacticalData(rangeStart, rangeEnd, reloadKey, "all");

  const { reasons, reload: reloadReasons } = useRecoveryReasons();

  if (loading) return <p className="text-muted-foreground">Carregando configurações...</p>;

  return (
    <div className="space-y-5 md:space-y-6">
      <StripeBackupPanel profiles={profiles} today={today} onChanged={() => setReloadKey((k) => k + 1)} />

      <TacticalGoalsManager
        metrics={metrics}
        profiles={profiles}
        teams={teams}
        goals={goals}
        onChanged={() => setReloadKey((k) => k + 1)}
      />

      <RecoveryReasonsConfig reasons={reasons} onChanged={reloadReasons} />

      <CampaignCouponsConfig />
    </div>
  );
}
