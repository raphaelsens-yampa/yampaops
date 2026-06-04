import { Fragment, memo, useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import {
  createPricingCtx,
  fmtBRL,
  fmtPct,
  newId,
  type PricingCtx,
} from "@/lib/pricing/engine";
import type { MarkupLineKey, PricingSnapshot, Service } from "@/lib/pricing/types";
import { LINE_LABEL } from "@/lib/pricing/types";

interface Props {
  snap: PricingSnapshot;
  update: (u: (s: PricingSnapshot) => PricingSnapshot) => void;
  readOnly?: boolean;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  preco_bom: "default",
  abaixo_ideal: "secondary",
  acima_ideal: "outline",
  prejuizo: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  preco_bom: "Preço bom",
  abaixo_ideal: "Abaixo do ideal",
  acima_ideal: "Acima do ideal",
  prejuizo: "Prejuízo",
};

export function ServicesEditor({ snap, update, readOnly = false }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const ctx = useMemo(() => createPricingCtx(snap), [snap]);

  const lineKeys = useMemo(
    () => Object.keys(snap.markup_lines) as MarkupLineKey[],
    [snap.markup_lines],
  );

  const addService = useCallback(
    () =>
      update((s) => ({
        ...s,
        services: [
          ...s.services,
          {
            id: newId("srv"),
            name: "Novo serviço",
            contract_months: 12,
            line: "gold",
            practiced_price: 0,
            qty_sold: 0,
            recipe: [],
            active: true,
          },
        ],
      })),
    [update],
  );

  const onPatch = useCallback(
    (id: string, p: Partial<Service>) => {
      update((s) => ({
        ...s,
        services: s.services.map((x) => (x.id === id ? { ...x, ...p } : x)),
      }));
    },
    [update],
  );

  const onRemove = useCallback(
    (id: string) => {
      update((s) => ({ ...s, services: s.services.filter((x) => x.id !== id) }));
    },
    [update],
  );

  const onToggle = useCallback(
    (id: string) => setOpen((curr) => (curr === id ? null : id)),
    [],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{readOnly ? "Catálogo de Serviços" : "Cadastro de Serviços"}</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {readOnly
              ? "Visualize os serviços disponíveis. Edição restrita a administradores."
              : "Defina a ficha técnica, o preço praticado e veja o preço ideal sugerido."}
          </p>
        </div>
        {!readOnly && (
          <Button size="sm" onClick={addService}>
            <Plus className="h-4 w-4 mr-1" /> Novo serviço
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Serviço</TableHead>
              <TableHead className="w-28">Linha</TableHead>
              <TableHead className="w-20">Meses</TableHead>
              <TableHead className="w-32 text-right">Praticado total</TableHead>
              <TableHead className="w-32 text-right">Praticado /mês</TableHead>
              <TableHead className="w-32 text-right">Custo total</TableHead>
              <TableHead className="w-32 text-right">Ideal total</TableHead>
              <TableHead className="w-20 text-right">MC %</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {snap.services.map((svc) => (
              <ServiceRow
                key={svc.id}
                svc={svc}
                ctx={ctx}
                snap={snap}
                update={update}
                isOpen={open === svc.id}
                onToggle={onToggle}
                onPatch={onPatch}
                onRemove={onRemove}
                lineKeys={lineKeys}
                readOnly={readOnly}
              />
            ))}
            {snap.services.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-6">
                  Nenhum serviço cadastrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

interface RowProps {
  svc: Service;
  ctx: PricingCtx;
  snap: PricingSnapshot;
  update: Props["update"];
  isOpen: boolean;
  onToggle: (id: string) => void;
  onPatch: (id: string, p: Partial<Service>) => void;
  onRemove: (id: string) => void;
  lineKeys: MarkupLineKey[];
  readOnly?: boolean;
}

const ServiceRow = memo(function ServiceRow({
  svc,
  ctx,
  snap,
  update,
  isOpen,
  onToggle,
  onPatch,
  onRemove,
  lineKeys,
  readOnly = false,
}: RowProps) {
  const c = ctx.serviceCalc(svc);
  return (
    <Fragment>
      <TableRow>
        <TableCell>
          <Button size="icon" variant="ghost" onClick={() => onToggle(svc.id)}>
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </TableCell>
        <TableCell>
          <Input
            value={svc.name}
            disabled={readOnly}
            onChange={(e) => onPatch(svc.id, { name: e.target.value })}
          />
        </TableCell>
        <TableCell>
          <Select
            value={svc.line}
            disabled={readOnly}
            onValueChange={(v) => onPatch(svc.id, { line: v as MarkupLineKey })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {lineKeys.map((k) => (
                <SelectItem key={k} value={k}>{LINE_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell>
          <Input
            type="number"
            disabled={readOnly}
            value={svc.contract_months}
            onChange={(e) => onPatch(svc.id, { contract_months: Number(e.target.value) })}
          />
        </TableCell>
        <TableCell>
          <Input
            type="number"
            step="0.01"
            className="text-right"
            disabled={readOnly}
            value={svc.practiced_price}
            onChange={(e) => onPatch(svc.id, { practiced_price: Number(e.target.value) })}
          />
        </TableCell>
        <TableCell className="text-right">{fmtBRL(c.practiced_monthly)}</TableCell>
        <TableCell className="text-right">{fmtBRL(c.cost_total)}</TableCell>
        <TableCell className="text-right">{fmtBRL(c.ideal_price_total)}</TableCell>
        <TableCell className="text-right">{fmtPct(c.margin_pct)}</TableCell>
        <TableCell>
          <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</Badge>
        </TableCell>
        <TableCell>
          {!readOnly && (
            <Button variant="ghost" size="icon" onClick={() => onRemove(svc.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </TableCell>
      </TableRow>
      {isOpen && (
        <TableRow>
          <TableCell colSpan={11} className="bg-muted/30">
            <RecipeEditor snap={snap} ctx={ctx} update={update} svc={svc} onPatch={onPatch} readOnly={readOnly} />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
});

function RecipeEditor({
  snap,
  ctx,
  svc,
  onPatch,
  readOnly = false,
}: {
  snap: PricingSnapshot;
  ctx: PricingCtx;
  update: Props["update"];
  svc: Service;
  onPatch: (id: string, p: Partial<Service>) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Ficha técnica: {svc.name}</h4>
        {!readOnly && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onPatch(svc.id, {
                recipe: [
                  ...svc.recipe,
                  { kind: "input", ref: snap.inputs[0]?.id ?? "", qty: 1 },
                ],
              })
            }
          >
            <Plus className="h-3 w-3 mr-1" /> Item
          </Button>
        )}
      </div>
      <div className="space-y-1">
        {svc.recipe.map((r, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <Select
              value={`${r.kind}:${r.ref}`}
              disabled={readOnly}
              onValueChange={(v) => {
                const [kind, ref] = v.split(":") as ["input" | "subproduct", string];
                onPatch(svc.id, {
                  recipe: svc.recipe.map((x, i) => (i === idx ? { ...x, kind, ref } : x)),
                });
              }}
            >
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {snap.inputs.map((i) => (
                  <SelectItem key={i.id} value={`input:${i.id}`}>📋 {i.name}</SelectItem>
                ))}
                {snap.subproducts.map((sp) => (
                  <SelectItem key={sp.id} value={`subproduct:${sp.id}`}>📦 {sp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              className="w-20"
              disabled={readOnly}
              value={r.qty}
              onChange={(e) =>
                onPatch(svc.id, {
                  recipe: svc.recipe.map((x, i) => (i === idx ? { ...x, qty: Number(e.target.value) } : x)),
                })
              }
            />
            <span className="text-sm font-medium w-28 text-right">{fmtBRL(ctx.recipeRefCost(r))}</span>
            {!readOnly && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() =>
                  onPatch(svc.id, {
                    recipe: svc.recipe.filter((_, i) => i !== idx),
                  })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        {svc.recipe.length === 0 && (
          <p className="text-xs text-muted-foreground italic">Adicione insumos ou subprodutos para compor o custo.</p>
        )}
      </div>
    </div>
  );
}
