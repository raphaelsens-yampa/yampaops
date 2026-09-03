import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ExternalLink, MessageSquare } from "lucide-react";
import { useCsClient360 } from "@/hooks/useCsClient360";
import { useChatwootIntegration } from "@/hooks/useChatwootIntegration";
import {
  CADENCE_LABEL, CONTACT_CHANNELS, CONTACT_OUTCOMES, ENGAGEMENT_LABEL,
  cadenceStatus, fmtBRL, fmtDate, type CsPortfolioRow, type CsSegment,
} from "@/lib/csPortfolio";

const AC_APP_BASE = (localStorage.getItem("ac_app_base_url") || "https://app.activecampaign.com").replace(/\/+$/, "");
const label = (list: { key: string; label: string }[], k: string) => list.find((i) => i.key === k)?.label || k;

export function ClientDrawer360({
  row,
  segments,
  analystName,
  onOpenChange,
  onLog,
}: {
  row: CsPortfolioRow | null;
  segments: CsSegment[];
  analystName: (id: string | null) => string;
  onOpenChange: (v: boolean) => void;
  onLog: (row: CsPortfolioRow) => void;
}) {
  const { data, isLoading } = useCsClient360(row?.email ?? null, row?.id ?? null);
  const { buildConversationUrl } = useChatwootIntegration();
  const segment = segments.find((s) => s.id === row?.segment_id);

  return (
    <Sheet open={!!row} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0">
        {row && (
          <ScrollArea className="h-full">
            <div className="p-5 space-y-5">
              <SheetHeader className="space-y-1 text-left">
                <SheetTitle className="text-lg">{row.company_name || row.email}</SheetTitle>
                <p className="text-xs text-muted-foreground break-all">{row.email}</p>
              </SheetHeader>

              <div className="flex flex-wrap gap-1">
                {segment && <Badge variant="outline">{segment.name}</Badge>}
                <Badge>{CADENCE_LABEL[cadenceStatus(row)]}</Badge>
                {row.engagement_band && (
                  <Badge variant="secondary">
                    Engajamento {ENGAGEMENT_LABEL[row.engagement_band] || row.engagement_band}
                    {row.engagement_score != null ? ` · ${row.engagement_score}` : ""}
                  </Badge>
                )}
                {row.churn_risk_score != null && <Badge variant="destructive">Risco {row.churn_risk_score}</Badge>}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <Info k="MRR" v={fmtBRL(row.mrr)} />
                <Info k="Plano" v={row.plano || "—"} />
                <Info k="Oferta" v={row.nome_oferta || "—"} />
                <Info k="Origem" v={row.origem_cliente || "—"} />
                <Info k="Recorrência" v={row.recorrencia_pagamento || "—"} />
                <Info k="Cliente desde" v={fmtDate(row.data_inicio)} />
                <Info k="Tempo de casa" v={row.tenure_days != null ? `${row.tenure_days} dias` : "—"} />
                <Info k="Ramo" v={row.industry || "—"} />
                <Info k="CS responsável" v={analystName(row.cs_user_id)} />
                <Info k="Conversas 90d" v={String(row.conversations_90d)} />
                <Info k="Último contato CS" v={fmtDate(row.last_contact_at)} />
                <Info k="Próximo contato" v={fmtDate(row.next_contact_due)} />
              </div>

              <Button className="w-full" onClick={() => onLog(row)}>Registrar atendimento</Button>

              <Separator />

              <Section title="Histórico de atendimentos CS">
                {isLoading ? <Loading /> : (data?.logs.length ? (
                  <ul className="space-y-2">
                    {data.logs.map((l) => (
                      <li key={l.id} className="rounded-md border p-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{label(CONTACT_CHANNELS, l.channel)}</span>
                          <span className="text-xs text-muted-foreground">{fmtDate(l.contacted_at)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{label(CONTACT_OUTCOMES, l.outcome)}</p>
                        {l.note && <p className="text-xs mt-1 whitespace-pre-wrap">{l.note}</p>}
                      </li>
                    ))}
                  </ul>
                ) : <Empty>Nenhum atendimento registrado ainda.</Empty>)}
              </Section>

              <Section title="Conversas no Chatwoot">
                {isLoading ? <Loading /> : (data?.conversations.length ? (
                  <ul className="space-y-2">
                    {data.conversations.map((c) => {
                      const url = buildConversationUrl(c.chatwoot_conversation_id);
                      return (
                        <li key={c.chatwoot_conversation_id} className="rounded-md border p-2 text-sm space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" /> #{c.chatwoot_conversation_id}
                            </span>
                            <span className="text-xs text-muted-foreground">{fmtDate(c.last_message_at)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {c.status || "—"}{c.inbox_name ? ` · ${c.inbox_name}` : ""}{c.assignee_name ? ` · ${c.assignee_name}` : ""}
                          </p>
                          {c.tabulacao_atendimento && <Badge variant="outline">{c.tabulacao_atendimento}</Badge>}
                          {c.theme?.primary_theme_canonical && (
                            <p className="text-xs"><span className="text-muted-foreground">Tema:</span> {c.theme.primary_theme_canonical}</p>
                          )}
                          {c.theme?.main_pain && (
                            <p className="text-xs"><span className="text-muted-foreground">Dor:</span> {c.theme.main_pain}</p>
                          )}
                          {(c.audit?.summary || c.theme?.summary) && (
                            <p className="text-xs whitespace-pre-wrap">{c.audit?.summary || c.theme?.summary}</p>
                          )}
                          {url && (
                            <a className="text-xs text-primary inline-flex items-center gap-1" href={url} target="_blank" rel="noreferrer">
                              Abrir no Chatwoot <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : <Empty>Sem conversas registradas.</Empty>)}
              </Section>

              <Section title="CSAT">
                {data?.csat.length ? (
                  <ul className="space-y-1 text-sm">
                    {data.csat.map((c, i) => (
                      <li key={i} className="flex items-start justify-between gap-2 border-b pb-1">
                        <span>Nota {c.rating}{c.feedback_message ? ` — ${c.feedback_message}` : ""}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{fmtDate(c.responded_at)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <Empty>Sem respostas de CSAT.</Empty>}
              </Section>

              <Section title="Negócios no CRM (ActiveCampaign)">
                {data?.deals.length ? (
                  <ul className="space-y-1 text-sm">
                    {data.deals.map((d: any) => (
                      <li key={d.ac_deal_id} className="flex items-start justify-between gap-2 border-b pb-1">
                        <div className="min-w-0">
                          <p className="truncate">{d.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {d.stage_title || "—"}{d.owner_name ? ` · ${d.owner_name}` : ""}
                          </p>
                        </div>
                        <a
                          className="text-xs text-primary inline-flex items-center gap-1 shrink-0"
                          href={`${AC_APP_BASE}/app/deals/${d.ac_deal_id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir <ExternalLink className="h-3 w-3" />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : <Empty>Sem negócios vinculados.</Empty>}
              </Section>
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</p>
      <p className="font-medium break-words">{v}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

const Loading = () => <p className="text-xs text-muted-foreground">Carregando...</p>;
const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs text-muted-foreground">{children}</p>
);
