import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings2, RefreshCw, CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useTacticalData } from "./useTacticalData";
import { MissionToday } from "./MissionToday";
import { TeamScoreboard } from "./TeamScoreboard";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { TeamConversionsTable } from "./TeamConversionsTable";
import { TeamRecoveriesTable } from "./TeamRecoveriesTable";
import { ManualEntryDialog } from "./ManualEntryDialog";
import { TacticalGoalsManager } from "./TacticalGoalsManager";
import { TacticalOverview } from "./TacticalOverview";
import { TacticalProgressChart } from "./TacticalProgressChart";
import { WeeklyGoalsPanel } from "./WeeklyGoalsPanel";
import { UnattributedSalesAlert } from "./UnattributedSalesAlert";
import { StripeBackupPanel } from "./StripeBackupPanel";
import { CategoryWeeklyGoalsPanel } from "./CategoryWeeklyGoalsPanel";
import { RecoveryChannelPanel } from "./RecoveryChannelPanel";
import { useRecoveryChannelData, channelsBySeller, summarizeChannels } from "./useRecoveryChannelData";
import { useRecoveryReasons } from "./recoveryChannels";



import { LowTouchView } from "./LowTouchView";
import { LowTouchAreasConfig } from "./LowTouchAreasConfig";
import { LowTouchConversionsTable } from "./LowTouchConversionsTable";
import { useLowTouchData } from "./useLowTouchData";
import { metricsForTeam } from "./types";
import { ORIGIN_OPTIONS, ORIGIN_MIN_DATE_HINT, isOriginFiltered, type OriginFilter } from "@/lib/origins";

const ALL_TEAMS = "__all__";
const LOW_TOUCH = "__lowtouch__";

export function TacticalTracking() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin" || role === "tatico";
  const realToday = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [refDate, setRefDate] = useState<Date>(realToday);
  const today = useMemo(() => { const d = new Date(refDate); d.setHours(0, 0, 0, 0); return d; }, [refDate]);
  const rangeStart = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() - 89); return d; }, [today]);
  const [reloadKey, setReloadKey] = useState(0);
  const [showConfig, setShowConfig] = useState(false);
  const [teamId, setTeamId] = useState<string>("");
  const [focusUser, setFocusUser] = useState<string>("");
  const [revisedView, setRevisedView] = useState(false);
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all");


  const { metrics, goals, profiles, teams, members, daily, unmatchedOwners, loading } = useTacticalData(rangeStart, today, reloadKey, originFilter);
  const [lowTouchKey, setLowTouchKey] = useState(0);
  const lowTouch = useLowTouchData(rangeStart, today, reloadKey + lowTouchKey);

  const isLowTouch = teamId === LOW_TOUCH;

  const isOverview = teamId === ALL_TEAMS;


  const myTeamId = useMemo(
    () => members.find((m) => m.user_id === user?.id)?.team_id ?? null,
    [members, user],
  );

  useEffect(() => {
    if (teamId) return;
    if (isAdmin) setTeamId(ALL_TEAMS);
    else if (myTeamId) setTeamId(myTeamId);
  }, [myTeamId, teams, isAdmin, teamId]);


  const activeTeam = isOverview ? null : teams.find((t) => t.id === teamId) ?? null;
  const memberIds = useMemo(
    () =>
      isOverview
        ? Array.from(new Set(members.map((m) => m.user_id)))
        : members.filter((m) => m.team_id === teamId).map((m) => m.user_id),
    [members, teamId, isOverview],
  );
  const teamMetrics = useMemo(
    () => metricsForTeam(metrics, isOverview ? null : teamId || null),
    [metrics, teamId, isOverview],
  );

  // Canal (Cobrança x CS) e motivo das recuperações/retenções
  const [recoveryKey, setRecoveryKey] = useState(0);
  const { reasons: recoveryReasons } = useRecoveryReasons();
  const { rows: recoveryRows } = useRecoveryChannelData(rangeStart, today, memberIds, reloadKey + recoveryKey);
  const todayKeyStr = useMemo(() => format(today, "yyyy-MM-dd"), [today]);
  const monthStartKey = useMemo(
    () => format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-dd"),
    [today],
  );
  const recoveryMonthSummary = useMemo(
    () => summarizeChannels(recoveryRows.filter((r) => r.dateKey >= monthStartKey && r.dateKey <= todayKeyStr)),
    [recoveryRows, monthStartKey, todayKeyStr],
  );
  const recoveryTodayRows = useMemo(
    () => recoveryRows.filter((r) => r.dateKey === todayKeyStr),
    [recoveryRows, todayKeyStr],
  );
  const recoveryBySeller = useMemo(() => channelsBySeller(recoveryTodayRows), [recoveryTodayRows]);



  useEffect(() => {
    if (!user) return;
    if (!isAdmin) { setFocusUser(user.id); return; }
    if (isOverview) return;
    if (!focusUser || (memberIds.length && !memberIds.includes(focusUser))) {
      setFocusUser(memberIds.includes(user.id) ? user.id : memberIds[0] ?? user.id);
    }
  }, [user, isAdmin, memberIds, focusUser, isOverview]);


  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  const focusName = profiles.find((p) => p.user_id === focusUser)?.full_name || "Você";

  return (
    <div className="space-y-5 md:space-y-6">
      {isAdmin && (
        <Card className="md:static sticky top-[2.75rem] z-20">
          <CardContent className="p-3 md:p-4 space-y-3 md:space-y-0 md:flex md:flex-wrap md:items-center md:justify-between md:gap-3">
            {/* Linha 1: contexto */}
            <div className="flex items-center gap-2 md:flex-wrap">
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger className="flex-1 h-10 md:h-9 md:w-44 md:flex-none"><SelectValue placeholder="Time" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TEAMS}>Visão Geral</SelectItem>
                  <SelectItem value={LOW_TOUCH}>Low-touch</SelectItem>
                  {teams.map((t) => <SelectItem key={t.id} value={t.id}>Time {t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {!isOverview && !isLowTouch && (
                <Select value={focusUser} onValueChange={setFocusUser}>
                  <SelectTrigger className="flex-1 h-10 md:h-9 md:w-56 md:flex-none"><SelectValue placeholder="Colaborador" /></SelectTrigger>
                  <SelectContent>
                    {memberIds.map((uid) => (
                      <SelectItem key={uid} value={uid}>
                        {profiles.find((p) => p.user_id === uid)?.full_name || "—"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {!isLowTouch && (
                <Select value={originFilter} onValueChange={(v) => setOriginFilter(v as OriginFilter)}>
                  <SelectTrigger className="flex-1 h-10 md:h-9 md:w-40 md:flex-none" aria-label="Origem">
                    <SelectValue placeholder="Origem" />
                  </SelectTrigger>
                  <SelectContent>
                    {ORIGIN_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.value === "all" ? "Origem: Geral" : `Origem: ${o.label}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>


            {/* Linha 2: data + visão + ações */}
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("h-10 md:h-9 flex-1 md:flex-none justify-start text-left font-normal")}>
                    <CalendarIcon className="h-4 w-4 mr-1 shrink-0" />
                    {format(today, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={today}
                    onSelect={(d) => d && setRefDate(d)}
                    disabled={(d) => d > realToday}
                    locale={ptBR}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              {today.getTime() !== realToday.getTime() && (
                <Button variant="ghost" size="sm" className="h-10 md:h-9" onClick={() => setRefDate(realToday)}>Hoje</Button>
              )}
              <div className="flex items-center gap-2 rounded-md border px-2.5 h-10 md:h-9 flex-1 md:flex-none justify-center">
                <Switch id="revised-view" checked={revisedView} onCheckedChange={setRevisedView} />
                <Label htmlFor="revised-view" className="text-xs cursor-pointer whitespace-nowrap">
                  Revisada
                </Label>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-10 md:h-9 w-10 md:w-auto p-0 md:px-3 shrink-0"
                aria-label="Atualizar dados"
                onClick={() => setReloadKey((k) => k + 1)}
              >
                <RefreshCw className="h-4 w-4 md:mr-1" />
                <span className="hidden md:inline">Atualizar dados</span>
              </Button>
              {!isLowTouch && (
                <div className="flex-1 md:flex-none [&_button]:w-full [&_button]:h-10 md:[&_button]:h-9">
                  <ManualEntryDialog metrics={teamMetrics} profiles={profiles} memberIds={memberIds} defaultUserId={focusUser} onSaved={() => setReloadKey((k) => k + 1)} />
                </div>
              )}
              {!isLowTouch && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 md:h-9 w-10 md:w-auto p-0 md:px-3 shrink-0"
                  aria-label="Configurar metas diárias"
                  onClick={() => setShowConfig((v) => !v)}
                >
                  <Settings2 className="h-4 w-4 md:mr-1" />
                  <span className="hidden md:inline">Configurar metas diárias</span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!isLowTouch && unmatchedOwners.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Oportunidades abertas sem vendedor vinculado:{" "}
          {unmatchedOwners.map((o) => `${o.owner_name} (${o.count})`).join(", ")}. Vincule em Funis
          ActiveCampaign → Conexão para que contem no realizado.
        </p>
      )}

      {isOriginFiltered(originFilter) && !isLowTouch && (

        <p className="text-xs text-muted-foreground">
          Recorte por origem: o realizado histórico vem das fontes canônicas (Metabase) e é rateado
          pela participação da origem na base por price ID. O realizado do dia vigente (Stripe) e os
          lançamentos de CS (recuperados/retidos) são considerados origem Yampa. Dias anteriores ao
          início da marcação de origem usam a participação mais antiga conhecida como estimativa,
          então 4blue + Yampa sempre soma o Geral.{" "}
          {ORIGIN_MIN_DATE_HINT}.

        </p>
      )}


      {isAdmin && (
        <UnattributedSalesAlert rangeStart={rangeStart} rangeEnd={today} refreshKey={reloadKey} />
      )}

      {isAdmin && (
        <StripeBackupPanel
          profiles={profiles}
          today={today}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      )}

      {isLowTouch ? (
        <>

          <LowTouchAreasConfig
            areas={lowTouch.areas}
            allLabels={lowTouch.allLabels}
            canEdit={isAdmin}
            onChanged={() => setLowTouchKey((k) => k + 1)}
          />
          {lowTouch.loading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : (
            <>
              <LowTouchView sales={lowTouch.sales} today={today} />
              <WeeklyGoalsPanel today={today} lowTouchSales={lowTouch.sales} />
              <CategoryWeeklyGoalsPanel today={today} daily={daily} refreshKey={reloadKey} origin={originFilter} />
              <LowTouchConversionsTable sales={lowTouch.sales} today={today} />


            </>
          )}
        </>
      ) : (
        <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start">
        <div className="space-y-4">
          {isOverview ? (
            <TacticalOverview
              metrics={teamMetrics}
              goals={goals}
              daily={daily}
              memberIds={memberIds}
              members={members}
              teams={teams}
              today={today}
              revisedView={revisedView}
              lowTouchSales={lowTouch.sales}
              recoveryChannels={recoveryMonthSummary}

            />
          ) : (
            <MissionToday
              userId={focusUser}
              userName={focusName}
              teamId={teamId || null}
              teamName={activeTeam?.name ?? null}
              metrics={teamMetrics}
              allMetrics={metrics}

              goals={goals}
              daily={daily}
              today={today}
              revisedView={revisedView}
              recoveryToday={summarizeChannels(recoveryTodayRows.filter((r) => r.sellerId === focusUser))}
            />

          )}
          {!isAdmin && (
            <ManualEntryDialog metrics={teamMetrics} onSaved={() => setReloadKey((k) => k + 1)} />
          )}
        </div>

        <TeamScoreboard
          metrics={teamMetrics}
          goals={goals}
          daily={daily}
          profiles={profiles}
          memberIds={memberIds}
          teamId={isOverview ? null : teamId || null}
          teamName={activeTeam?.name ?? null}
          today={today}
          groupByTeam={isOverview}
          teams={teams}
          members={members}
          lowTouchSales={isOverview ? lowTouch.sales : []}
          recoveryChannels={recoveryBySeller}

        />


      </div>

      <WeeklyGoalsPanel
        metrics={teamMetrics}
        goals={goals}
        daily={daily}
        memberIds={memberIds}
        teamId={isOverview ? null : teamId || null}
        today={today}
      />

      <CategoryWeeklyGoalsPanel today={today} daily={daily} refreshKey={reloadKey} origin={originFilter} />

      <RecoveryChannelPanel
        rows={recoveryRows}
        reasons={recoveryReasons}
        today={today}
        teamName={isOverview ? null : activeTeam?.name ?? null}
      />




      <TacticalProgressChart

        metrics={teamMetrics}
        goals={goals}
        daily={daily}
        memberIds={memberIds}
        teamId={isOverview ? null : teamId || null}
        today={today}
        revisedView={revisedView}
      />

      <ActivityHeatmap
        metrics={teamMetrics}
        goals={goals}
        daily={daily}
        profiles={profiles}
        memberIds={memberIds}
        teamId={isOverview ? null : teamId || null}
        today={today}
      />

      <TeamConversionsTable
        memberIds={memberIds}
        profiles={profiles}
        teamName={isOverview ? "Visão Geral" : activeTeam?.name ?? null}
        today={today}
        refreshKey={reloadKey}
        includeLowTouch={isOverview}
      />


      <TeamRecoveriesTable
        memberIds={memberIds}
        profiles={profiles}
        metrics={teamMetrics}
        teamName={isOverview ? "Visão Geral" : activeTeam?.name ?? null}

        today={today}
        refreshKey={reloadKey}
        onChanged={() => setRecoveryKey((k) => k + 1)}

      />
        </>
      )}

      {isAdmin && showConfig && !isLowTouch && (

        <TacticalGoalsManager
          metrics={metrics}
          profiles={profiles}
          teams={teams}
          goals={goals}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
