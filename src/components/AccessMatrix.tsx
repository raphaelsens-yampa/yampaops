import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { CRM_SECTIONS, AREA_DEFS, ROLE_LABEL, inheritParents, type CrmAreaKey, type Permissions, type AreaPermission } from "@/lib/accessRegistry";
import type { AccessLevel } from "@/components/AccessLevelManager";

function cell(p?: AreaPermission) {
  if (!p || (!p.view && !p.create && !p.edit)) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="font-mono text-xs">
      {p.view ? "V" : "·"}{p.create ? "C" : "·"}{p.edit ? "E" : "·"}
    </span>
  );
}

export function AccessMatrix({ levels }: { levels: AccessLevel[] }) {
  const resolved = levels.map((l) => ({ level: l, perms: inheritParents((l.permissions || {}) as Permissions) }));
  const orphan = Object.values(AREA_DEFS).filter((d) => !resolved.some((r) => r.perms[d.key as CrmAreaKey]?.view));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Matriz de acesso</CardTitle>
        <p className="text-sm text-muted-foreground">
          V = ver, C = criar, E = editar. O acesso vale quando o nível libera <strong>e</strong> o papel atende o mínimo. Admin vê tudo.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {orphan.length > 0 && (
          <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <strong>{orphan.length} funcionalidade(s) que nenhum nível libera</strong> (só Admin acessa):{" "}
              {orphan.map((o) => o.label).join(", ")}
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionalidade</TableHead>
                <TableHead>Papel mínimo</TableHead>
                {resolved.map((r) => <TableHead key={r.level.id} className="text-center">{r.level.name}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {CRM_SECTIONS.map((s) => [
                <TableRow key={s.key} className="bg-muted/40">
                  <TableCell colSpan={2 + resolved.length} className="font-semibold text-sm">{s.label}</TableCell>
                </TableRow>,
                ...s.areas.map((a) => {
                  const def = AREA_DEFS[a.key];
                  return (
                    <TableRow key={a.key}>
                      <TableCell className="text-sm">
                        {def.parent && <span className="text-muted-foreground mr-1">↳</span>}
                        {a.label}
                      </TableCell>
                      <TableCell>
                        {def.minRole ? <Badge variant="outline">{ROLE_LABEL[def.minRole]}</Badge> : <span className="text-xs text-muted-foreground">Qualquer</span>}
                      </TableCell>
                      {resolved.map((r) => (
                        <TableCell key={r.level.id} className="text-center">{cell(r.perms[a.key as CrmAreaKey])}</TableCell>
                      ))}
                    </TableRow>
                  );
                }),
              ])}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
