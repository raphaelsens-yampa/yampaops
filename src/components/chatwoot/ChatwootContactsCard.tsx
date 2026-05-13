import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, RefreshCw, Users, Search, Link2, X } from "lucide-react";

type Stats = {
  total: number;
  with_email: number;
  with_phone: number;
  matched: number;
  by_method: Record<string, number>;
};

type Row = {
  chatwoot_contact_id: number;
  name: string | null;
  email: string | null;
  phone_e164: string | null;
  phone_digits: string | null;
  additional_emails: string[];
  additional_phones: string[];
  conversations_count: number;
  last_activity_at: string | null;
  matched_contact_id: string | null;
  match_method: string | null;
  inbox_ids: number[];
};

export function ChatwootContactsCard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<"all" | "matched" | "unmatched" | "no_email" | "no_phone">("all");
  const [search, setSearch] = useState("");
  const [pageStart, setPageStart] = useState("1");
  const [maxPages, setMaxPages] = useState("40");

  async function loadStats() {
    const [{ count: total }, { count: withEmail }, { count: withPhone }, { count: matched }] =
      await Promise.all([
        supabase.from("chatwoot_contacts").select("*", { count: "exact", head: true }),
        supabase.from("chatwoot_contacts").select("*", { count: "exact", head: true }).not("email", "is", null),
        supabase.from("chatwoot_contacts").select("*", { count: "exact", head: true }).not("phone_digits", "is", null),
        supabase.from("chatwoot_contacts").select("*", { count: "exact", head: true }).not("matched_contact_id", "is", null),
      ]);

    const { data: methods } = await supabase
      .from("chatwoot_contacts")
      .select("match_method")
      .not("match_method", "is", null)
      .limit(50000);
    const by_method: Record<string, number> = {};
    (methods || []).forEach((r: any) => {
      const k = r.match_method || "none";
      by_method[k] = (by_method[k] || 0) + 1;
    });

    setStats({
      total: total || 0,
      with_email: withEmail || 0,
      with_phone: withPhone || 0,
      matched: matched || 0,
      by_method,
    });
  }

  async function loadRows() {
    setLoading(true);
    let q = supabase
      .from("chatwoot_contacts")
      .select("chatwoot_contact_id, name, email, phone_e164, phone_digits, additional_emails, additional_phones, conversations_count, last_activity_at, matched_contact_id, match_method, inbox_ids")
      .order("last_activity_at", { ascending: false, nullsFirst: false })
      .limit(100);

    if (filter === "matched") q = q.not("matched_contact_id", "is", null);
    if (filter === "unmatched") q = q.is("matched_contact_id", null);
    if (filter === "no_email") q = q.is("email", null);
    if (filter === "no_phone") q = q.is("phone_digits", null);

    if (search.trim()) {
      const s = search.trim();
      q = q.or(`name.ilike.%${s}%,email.ilike.%${s}%,phone_digits.ilike.%${s}%`);
    }

    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data as Row[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    loadStats();
    loadRows();
  }, []);

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function runBackfill() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("chatwoot-contacts-backfill", {
        body: {
          page_start: Number(pageStart) || 1,
          max_pages: Number(maxPages) || 40,
        },
      });
      if (error) throw error;
      toast.success(
        `Processados ${data?.processed || 0} contatos (páginas ${pageStart}–${(Number(pageStart) || 1) + (data?.pages_processed || 0) - 1}). Próxima: ${data?.next_page ?? "fim"}`,
      );
      if (data?.next_page) setPageStart(String(data.next_page));
      await loadStats();
      await loadRows();
    } catch (e: any) {
      toast.error(e.message || "Falha no backfill");
    } finally {
      setRunning(false);
    }
  }

  const pct = (n: number) => (stats?.total ? Math.round((n / stats.total) * 100) : 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Contatos Chatwoot</CardTitle>
              <CardDescription>
                Espelho local dos contatos do Chatwoot (com emails/telefones secundários) usado para casar com a base interna.
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={pageStart}
              onChange={(e) => setPageStart(e.target.value)}
              className="w-20 h-9 text-xs"
              placeholder="página"
            />
            <Input
              value={maxPages}
              onChange={(e) => setMaxPages(e.target.value)}
              className="w-20 h-9 text-xs"
              placeholder="páginas"
            />
            <Button onClick={runBackfill} disabled={running} size="sm">
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sincronizar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi label="Total" value={stats?.total ?? "—"} />
          <Kpi label="Com email" value={`${stats?.with_email ?? 0} (${pct(stats?.with_email || 0)}%)`} />
          <Kpi label="Com telefone" value={`${stats?.with_phone ?? 0} (${pct(stats?.with_phone || 0)}%)`} />
          <Kpi label="Casados c/ base" value={`${stats?.matched ?? 0} (${pct(stats?.matched || 0)}%)`} />
        </div>

        {/* Breakdown por método */}
        {stats?.by_method && Object.keys(stats.by_method).length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(stats.by_method).map(([k, v]) => (
              <Badge key={k} variant="outline">
                {k}: {v}
              </Badge>
            ))}
          </div>
        )}

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
            <SelectTrigger className="w-48 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="matched">Casados</SelectItem>
              <SelectItem value="unmatched">Sem match</SelectItem>
              <SelectItem value="no_email">Sem email</SelectItem>
              <SelectItem value="no_phone">Sem telefone</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1 flex-1 min-w-[200px]">
            <Input
              placeholder="Buscar por nome, email ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadRows()}
              className="h-9"
            />
            <Button size="sm" variant="outline" onClick={loadRows}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>CW #</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead className="text-center">Sec.</TableHead>
                <TableHead className="text-center">Conv</TableHead>
                <TableHead>Match</TableHead>
                <TableHead>Última atividade</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">Carregando...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">Nenhum contato. Rode o sync.</TableCell></TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.chatwoot_contact_id}>
                    <TableCell className="font-mono text-xs">{r.chatwoot_contact_id}</TableCell>
                    <TableCell className="text-sm">{r.name || "—"}</TableCell>
                    <TableCell className="text-xs">{r.email || "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{r.phone_e164 || r.phone_digits || "—"}</TableCell>
                    <TableCell className="text-xs text-center text-muted-foreground">
                      {(r.additional_emails?.length || 0) + (r.additional_phones?.length || 0) || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-center">{r.conversations_count}</TableCell>
                    <TableCell className="text-xs">
                      {r.matched_contact_id ? (
                        <Badge variant="default" className="text-xs">{r.match_method}</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">sem match</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.last_activity_at ? new Date(r.last_activity_at).toLocaleString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <ManualMatchDialog row={r} onChanged={() => { loadStats(); loadRows(); }} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function ManualMatchDialog({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Array<{ id: string; name: string; email: string | null; phone: string | null }>>([]);
  const [busy, setBusy] = useState(false);

  async function doSearch() {
    const s = search.trim();
    if (!s) return;
    const { data } = await supabase
      .from("contacts")
      .select("id, name, email, phone")
      .or(`name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`)
      .limit(20);
    setResults((data as any) || []);
  }

  async function link(contactId: string) {
    setBusy(true);
    const { error } = await supabase
      .from("chatwoot_contacts")
      .update({
        matched_contact_id: contactId,
        match_method: "manual",
        matched_at: new Date().toISOString(),
      })
      .eq("chatwoot_contact_id", row.chatwoot_contact_id);
    if (error) { toast.error(error.message); setBusy(false); return; }
    await supabase.from("chatwoot_contact_match_log").insert({
      chatwoot_contact_id: row.chatwoot_contact_id,
      method: "manual",
      matched_contact_id: contactId,
      notes: "Match manual via UI",
    });
    toast.success("Match aplicado");
    setBusy(false);
    setOpen(false);
    onChanged();
  }

  async function unlink() {
    setBusy(true);
    const { error } = await supabase
      .from("chatwoot_contacts")
      .update({ matched_contact_id: null, match_method: "none", matched_at: null })
      .eq("chatwoot_contact_id", row.chatwoot_contact_id);
    if (error) { toast.error(error.message); setBusy(false); return; }
    toast.success("Match removido");
    setBusy(false);
    setOpen(false);
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 px-2">
          <Link2 className="h-3 w-3 mr-1" />
          {row.matched_contact_id ? "Trocar" : "Casar"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Casar contato Chatwoot manualmente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            CW #{row.chatwoot_contact_id} · {row.name || "—"} · {row.email || row.phone_e164 || "—"}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Buscar contato interno por nome, email ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
            />
            <Button size="sm" onClick={doSearch}><Search className="h-4 w-4" /></Button>
          </div>
          <div className="max-h-80 overflow-auto border rounded">
            {results.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">Sem resultados</div>
            ) : (
              <Table>
                <TableBody>
                  {results.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm">{c.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.email || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.phone || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" disabled={busy} onClick={() => link(c.id)}>Vincular</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          {row.matched_contact_id && (
            <Button size="sm" variant="outline" disabled={busy} onClick={unlink}>
              <X className="h-3 w-3 mr-1" /> Remover match atual
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
