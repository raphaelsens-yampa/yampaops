import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTacticalData } from "./useTacticalData";
import { SellerDailyCards } from "./SellerDailyCards";
import { TacticalLeaderboard } from "./TacticalLeaderboard";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { ManualEntryDialog } from "./ManualEntryDialog";
import { TacticalGoalsManager } from "./TacticalGoalsManager";

export function TacticalTracking() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin" || role === "tatico";
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const rangeStart = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() - 89); return d; }, [today]);
  const [reloadKey, setReloadKey] = useState(0);
  const [filterUser, setFilterUser] = useState<string>(isAdmin ? "all" : (user?.id ?? ""));

  const { metrics, goals, profiles, daily, loading } = useTacticalData(rangeStart, today, reloadKey);

  const visibleUsers = useMemo(() => {
    if (!isAdmin) return user ? [user.id] : [];
    if (filterUser !== "all") return [filterUser];
    const active = new Set(daily.map((d) => d.user_id));
    goals.forEach((g) => { if (g.user_id) active.add(g.user_id); });
    return profiles.filter((p) => active.has(p.user_id)).map((p) => p.user_id);
  }, [isAdmin, filterUser, daily, goals, profiles, user]);

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Select value={filterUser} onValueChange={setFilterUser}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os vendedores</SelectItem>
                  {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || "—"}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <ManualEntryDialog metrics={metrics} onSaved={() => setReloadKey((k) => k + 1)} />
        </CardContent>
      </Card>

      <div className="space-y-6">
        {visibleUsers.map((uid) => (
          <SellerDailyCards
            key={uid}
            userId={uid}
            userName={profiles.find((p) => p.user_id === uid)?.full_name || "—"}
            metrics={metrics}
            goals={goals}
            daily={daily}
            today={today}
          />
        ))}
        {visibleUsers.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum vendedor com dados no período.</p>
        )}
      </div>

      <TacticalLeaderboard metrics={metrics} daily={daily} profiles={profiles} today={today} />
      <ActivityHeatmap metrics={metrics} daily={daily} profiles={profiles} today={today} />

      {isAdmin && (
        <TacticalGoalsManager
          metrics={metrics}
          profiles={profiles}
          goals={goals}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
