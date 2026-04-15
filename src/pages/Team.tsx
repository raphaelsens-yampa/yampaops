import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ORIGIN_LABELS } from "@/lib/constants";

export default function TeamPage() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [p, l, a, r] = await Promise.all([
        supabase.from("profiles").select("*"),
        supabase.from("leads").select("*"),
        supabase.from("activities").select("*"),
        supabase.from("user_roles").select("*"),
      ]);
      setProfiles(p.data || []);
      setLeads(l.data || []);
      setActivities(a.data || []);
      setRoles(r.data || []);
      setLoading(false);
    }
    load();
  }, []);

  // Sales velocity by channel
  const wonLeads = leads.filter(l => l.stage === "fechado_won");
  const velocityByChannel: Record<string, { total: number; count: number }> = {};
  wonLeads.forEach(l => {
    const days = (new Date(l.updated_at).getTime() - new Date(l.created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (!velocityByChannel[l.origin]) velocityByChannel[l.origin] = { total: 0, count: 0 };
    velocityByChannel[l.origin].total += days;
    velocityByChannel[l.origin].count++;
  });
  const velocityChart = Object.entries(velocityByChannel).map(([k, v]) => ({
    name: ORIGIN_LABELS[k] || k,
    dias: v.count > 0 ? Math.round(v.total / v.count) : 0,
  }));

  if (loading) return <Layout><p className="text-muted-foreground p-8">Carregando...</p></Layout>;

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-2xl font-heading font-bold">Equipe</h1>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Deals Won</TableHead>
                  <TableHead className="text-right">Atividades</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map(p => {
                  const userRole = roles.find(r => r.user_id === p.user_id);
                  const userLeads = leads.filter(l => l.consultant_id === p.user_id);
                  const userWon = userLeads.filter(l => l.stage === "fechado_won");
                  const userActs = activities.filter(a => a.user_id === p.user_id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.full_name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={userRole?.role === "admin" ? "default" : "secondary"}>
                          {userRole?.role || "seller"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{userLeads.length}</TableCell>
                      <TableCell className="text-right">{userWon.length}</TableCell>
                      <TableCell className="text-right">{userActs.length}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {velocityChart.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Velocidade de Venda por Canal (dias)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={velocityChart}>
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="dias" fill="hsl(193, 99%, 44%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
