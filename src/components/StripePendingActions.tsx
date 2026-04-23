import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  opportunityId: string;
  stripeEmail?: string | null;
  stripePriceId?: string | null;
  stripeMrr?: number | null;
  pendingSince?: string | null;
  wonSlug: string;
  onChanged: () => void;
}

export function StripePendingActions({
  opportunityId, stripeEmail, stripePriceId, stripeMrr, pendingSince, wonSlug, onChanged,
}: Props) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);

  async function approve() {
    setLoading("approve");
    const { error } = await supabase
      .from("opportunities")
      .update({ stage: wonSlug })
      .eq("id", opportunityId);
    setLoading(null);
    if (error) toast.error(error.message);
    else {
      toast.success("Conciliado e comissão gerada");
      onChanged();
    }
  }

  async function reject() {
    setLoading("reject");
    // Restore previous stage and clear stripe fields
    const { data: opp } = await supabase
      .from("opportunities")
      .select("previous_stage")
      .eq("id", opportunityId)
      .maybeSingle();

    const fallbackStage = opp?.previous_stage || "novo_lead";

    const [{ error }, _logRes] = await Promise.all([
      supabase.from("opportunities").update({
        stage: fallbackStage,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        stripe_price_id: null,
        stripe_pending_since: null,
        previous_stage: null,
      }).eq("id", opportunityId),
      supabase.from("integration_sync_errors").insert({
        entity_type: "stripe_rejected_by_user",
        ac_id: null,
        error_message: `Conciliação Stripe rejeitada manualmente para deal ${opportunityId}`,
        payload: { opportunity_id: opportunityId, restored_stage: fallbackStage },
        resolved: true,
      }),
    ]);

    setLoading(null);
    if (error) toast.error(error.message);
    else {
      toast.success("Rejeitado e voltou para etapa anterior");
      onChanged();
    }
  }

  return (
    <div className="space-y-2 pt-2 border-t border-warning/30" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="border-warning/50 text-warning text-[10px]">Stripe</Badge>
        {stripeMrr != null && (
          <span className="text-xs font-medium">R$ {stripeMrr.toLocaleString("pt-BR")}</span>
        )}
      </div>
      {stripeEmail && (
        <p className="text-[11px] text-muted-foreground truncate" title={stripeEmail}>{stripeEmail}</p>
      )}
      {stripePriceId && (
        <p className="text-[10px] font-mono text-muted-foreground truncate" title={stripePriceId}>{stripePriceId}</p>
      )}
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="default"
          className="h-7 flex-1 text-xs"
          onClick={(e) => { e.stopPropagation(); approve(); }}
          disabled={loading !== null}
        >
          {loading === "approve" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
          Aprovar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 flex-1 text-xs"
          onClick={(e) => { e.stopPropagation(); reject(); }}
          disabled={loading !== null}
        >
          {loading === "reject" ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3 mr-1" />}
          Rejeitar
        </Button>
      </div>
    </div>
  );
}
