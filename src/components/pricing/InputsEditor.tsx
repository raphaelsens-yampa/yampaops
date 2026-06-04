import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { createPricingCtx, fmtBRL, newId } from "@/lib/pricing/engine";
import type { PricingSnapshot } from "@/lib/pricing/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  snap: PricingSnapshot;
  update: (u: (s: PricingSnapshot) => PricingSnapshot) => void;
}

export function InputsEditor({ snap, update }: Props) {
  const ctx = useMemo(() => createPricingCtx(snap), [snap]);
  const cpm = ctx.cpm;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Insumos (ações)</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Custo / minuto: {fmtBRL(cpm)}</p>
          </div>
          <Button
            size="sm"
            onClick={() =>
              update((s) => ({
                ...s,
                inputs: [...s.inputs, { id: newId("inp"), name: "Nova ação", minutes: 30, unit: "Minuto" }],
              }))
            }
          >
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="w-24">Minutos</TableHead>
                <TableHead className="w-28">Custo R$</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snap.inputs.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>
                    <Input
                      value={it.name}
                      onChange={(e) =>
                        update((s) => ({
                          ...s,
                          inputs: s.inputs.map((x) => (x.id === it.id ? { ...x, name: e.target.value } : x)),
                        }))
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={it.minutes}
                      onChange={(e) =>
                        update((s) => ({
                          ...s,
                          inputs: s.inputs.map((x) =>
                            x.id === it.id ? { ...x, minutes: Number(e.target.value) } : x,
                          ),
                        }))
                      }
                    />
                  </TableCell>
                  <TableCell className="font-medium">{fmtBRL(ctx.inputCost(it.id))}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        update((s) => ({ ...s, inputs: s.inputs.filter((x) => x.id !== it.id) }))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {snap.inputs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    Nenhum insumo.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Subprodutos (combos)</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Cada subproduto é um combo de insumos com quantidades.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() =>
              update((s) => ({
                ...s,
                subproducts: [...s.subproducts, { id: newId("sub"), name: "Novo subproduto", items: [] }],
              }))
            }
          >
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 max-h-[600px] overflow-auto">
          {snap.subproducts.map((sub) => (
            <div key={sub.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={sub.name}
                  onChange={(e) =>
                    update((s) => ({
                      ...s,
                      subproducts: s.subproducts.map((x) =>
                        x.id === sub.id ? { ...x, name: e.target.value } : x,
                      ),
                    }))
                  }
                />
                <span className="text-sm font-medium whitespace-nowrap">
                  {fmtBRL(ctx.subproductCost(sub.id))}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    update((s) => ({ ...s, subproducts: s.subproducts.filter((x) => x.id !== sub.id) }))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-1 pl-2">
                {sub.items.map((it, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Select
                      value={`${it.kind}:${it.ref}`}
                      onValueChange={(v) => {
                        const [kind, ref] = v.split(":") as ["input" | "subproduct", string];
                        update((s) => ({
                          ...s,
                          subproducts: s.subproducts.map((x) =>
                            x.id === sub.id
                              ? {
                                  ...x,
                                  items: x.items.map((q, i) => (i === idx ? { ...q, kind, ref } : q)),
                                }
                              : x,
                          ),
                        }));
                      }}
                    >
                      <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {snap.inputs.map((i) => (
                          <SelectItem key={i.id} value={`input:${i.id}`}>📋 {i.name}</SelectItem>
                        ))}
                        {snap.subproducts
                          .filter((x) => x.id !== sub.id)
                          .map((sp) => (
                            <SelectItem key={sp.id} value={`subproduct:${sp.id}`}>📦 {sp.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      className="w-20"
                      value={it.qty}
                      onChange={(e) =>
                        update((s) => ({
                          ...s,
                          subproducts: s.subproducts.map((x) =>
                            x.id === sub.id
                              ? {
                                  ...x,
                                  items: x.items.map((q, i) =>
                                    i === idx ? { ...q, qty: Number(e.target.value) } : q,
                                  ),
                                }
                              : x,
                          ),
                        }))
                      }
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        update((s) => ({
                          ...s,
                          subproducts: s.subproducts.map((x) =>
                            x.id === sub.id ? { ...x, items: x.items.filter((_, i) => i !== idx) } : x,
                          ),
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update((s) => ({
                      ...s,
                      subproducts: s.subproducts.map((x) =>
                        x.id === sub.id
                          ? {
                              ...x,
                              items: [
                                ...x.items,
                                { kind: "input", ref: s.inputs[0]?.id ?? "", qty: 1 },
                              ],
                            }
                          : x,
                      ),
                    }))
                  }
                >
                  <Plus className="h-3 w-3 mr-1" /> Item
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
