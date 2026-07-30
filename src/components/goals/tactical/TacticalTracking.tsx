import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings2, RefreshCw } from "lucide-react";
import { useTacticalData } from "./useTacticalData";
import { MissionToday } from "./MissionToday";
import { TeamScoreboard } from "./TeamScoreboard";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { TeamConversionsTable } from "./TeamConversionsTable";
import { TeamRecoveriesTable } from "./TeamRecoveriesTable";
import { ManualEntryDialog } from "./ManualEntryDialog";
import { TacticalGoalsManager } from "./TacticalGoalsManager";
import { TacticalOverview } from "./TacticalOverview";
import { metricsForTeam } from "./types";

const ALL_TEAMS = "__all__";

export function TacticalTracking() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin" || role === "tatico";
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const rangeStart = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() - 59); return d; }, [today]);
  const [reloadKey, setReloadKey] = useState(0);
  const [showConfig, setShowConfig] = useState(false);
  const [teamId, setTeamId] = useState<string>("");
  const [focusUser, setFocusUser] = useState<string>("");

  const { metrics, goals, profiles, teams, members, daily, loading } = useTacticalData(rangeStart, today, reloadKey);

  const isOverview = teamId === ALL_TEAMS;

  const myTeamId = useMemo(
    () => members.find((m) => m.user_id === user?.id)?.team_id ?? null,
    [members, user],
  );

  useEffect(() => {
    if (teamId) return;
    if (myTeamId) setTeamId(myTeamId);
    else if (isAdmin && teams.length) setTeamId(teams[0].id);
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
    <div className="space-y-6">
      {isAdmin && (
        <Card>
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Time" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TEAMS}>Visão Geral</SelectItem>
                  {teams.map((t) => <SelectItem key={t.id} value={t.id}>Time {t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {!isOverview && (
                <Select value={focusUser} onValueChange={setFocusUser}>
                  <SelectTrigger className="w-56"><SelectValue placeholder="Colaborador" /></SelectTrigger>
                  <SelectContent>
                    {memberIds.map((uid) => (
                      <SelectItem key={uid} value={uid}>
                        {profiles.find((p) => p.user_id === uid)?.full_name || "—"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
                <RefreshCw className="h-4 w-4 mr-1" /> Atualizar dados
              </Button>
              <ManualEntryDialog metrics={teamMetrics} profiles={profiles} memberIds={memberIds} defaultUserId={focusUser} onSaved={() => setReloadKey((k) => k + 1)} />
              <Button variant="ghost" size="sm" onClick={() => setShowConfig((v) => !v)}>
                <Settings2 className="h-4 w-4 mr-1" /> Configurar metas diárias
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
            />
          ) : (
            <MissionToday
              userId={focusUser}
              userName={focusName}
              teamId={teamId || null}
              teamName={activeTeam?.name ?? null}
              metrics={teamMetrics}
              goals={goals}
              daily={daily}
              today={today}
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
        />

      </div>

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
      />

      <TeamRecoveriesTable
        memberIds={memberIds}
        profiles={profiles}
        metrics={teamMetrics}
        teamName={isOverview ? "Visão Geral" : activeTeam?.name ?? null}

        today={today}
        refreshKey={reloadKey}
      />

      {isAdmin && showConfig && (
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
