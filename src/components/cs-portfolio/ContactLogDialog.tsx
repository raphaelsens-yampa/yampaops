import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONTACT_CHANNELS, CONTACT_OUTCOMES, todaySP, type CsPortfolioRow } from "@/lib/csPortfolio";
import { useCsPortfolioMutations } from "@/hooks/useCsPortfolio";
import { toast } from "sonner";

export function ContactLogDialog({
  row,
  open,
  onOpenChange,
}: {
  row: CsPortfolioRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { logContact } = useCsPortfolioMutations();
  const [channel, setChannel] = useState("whatsapp");
  const [outcome, setOutcome] = useState("respondeu");
  const [date, setDate] = useState(todaySP());
  const [note, setNote] = useState("");

  async function save() {
    if (!row) return;
    try {
      await logContact.mutateAsync({
        portfolio_id: row.id,
        email: row.email,
        channel,
        outcome,
        note: note.trim() || undefined,
        contacted_at: new Date(`${date}T12:00:00-03:00`).toISOString(),
      });
      toast.success("Atendimento registrado");
      setNote("");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Falha ao registrar atendimento");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar atendimento</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2 truncate">{row?.company_name || row?.email}</p>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Data do contato</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Canal</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_CHANNELS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Resultado</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_OUTCOMES.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Observações</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Resumo do contato, próximos passos..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={logContact.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
