import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { can, inheritParents, isKnownArea, AREA_DEFS } from "./accessRegistry";

const ROOT = join(__dirname, "..");
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "integrations" ? [] : walk(p);
    return /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}
const files = walk(ROOT).map((p) => ({ p: p.slice(ROOT.length + 1), s: readFileSync(p, "utf8").replace(/^\s*\/\/.*$/gm, "") }));
const NAV = new Set(["components/AppSidebar.tsx", "components/MobileBottomNav.tsx"]);
const all = (re: RegExp) => files.flatMap((f) => [...f.s.matchAll(re)].map((m) => ({ file: f.p, key: m[1] })));

describe("regra única de acesso", () => {
  const perms = { conversions: { view: true, create: false, edit: false }, carteira_cs: { view: true, create: true, edit: false } };
  it("Admin acessa tudo", () => expect(can("users", "edit", { role: "admin", permissions: {} })).toBe(true));
  it("Nível libera mas papel abaixo do mínimo bloqueia", () =>
    expect(can("conversions", "view", { role: "seller", permissions: perms })).toBe(false));
  it("Nível libera e papel atende", () => expect(can("conversions", "view", { role: "tatico", permissions: perms })).toBe(true));
  it("Sem marcação no nível bloqueia", () => expect(can("conversions", "create", { role: "tatico", permissions: perms })).toBe(false));
  it("Sub-área herda da área mãe", () => {
    const p = inheritParents(perms);
    expect(p.cs_tasks).toEqual({ view: true, create: true, edit: false });
    expect(can("cs_tasks", "create", { role: "seller", permissions: p })).toBe(true);
  });
  it("Histórico ActiveCampaign é somente leitura", () =>
    expect(can("integration_ac_funnels", "edit", { role: "tatico", permissions: { integration_ac_funnels: { view: true, create: true, edit: true } } })).toBe(false));
});

describe("amarras: toda funcionalidade vinculada à lista oficial", () => {
  const used = [
    ...all(/RequireArea area="([a-z_]+)"/g),
    ...all(/\barea: "([a-z_]+)"/g).filter((u) => NAV.has(u.file)),
    ...all(/can(?:View|Create|Edit|ViewSection)\("([a-z_]+)"\)/g),
  ];
  it("rotas, menus e telas só usam áreas cadastradas", () => {
    expect(used.filter((u) => !isKnownArea(u.key))).toEqual([]);
  });
  it("toda área cadastrada é usada por alguma rota, menu ou tela", () => {
    const keys = new Set(used.map((u) => u.key));
    expect(Object.keys(AREA_DEFS).filter((k) => !keys.has(k))).toEqual([]);
  });
  it("toda rota protegida passa por RequireArea (exceto públicas)", () => {
    const app = files.find((f) => f.p === "App.tsx")!.s;
    const routes = [...app.matchAll(/<Route path="([^"]+)" element=\{(<[A-Za-z]+)/g)];
    const PUBLIC = ["/tv/:area/:token", "/proposta-publica", "/profile", "/.lovable/oauth/consent", "*"];
    expect(routes.filter(([, path, el]) => el !== "<RequireArea" && !PUBLIC.includes(path)).map((r) => r[1])).toEqual([]);
  });
  // Arquivos legados que ainda comparam papel diretamente. NÃO adicione novos:
  // use canView/canCreate/canEdit com uma área (e minRole) em lib/accessRegistry.ts.
  const LEGACY = new Set([
    "App.tsx", "hooks/useAuth.tsx", "hooks/useCommercialPlan.ts", "lib/accessRegistry.ts",
    "components/ManagerOnly.tsx", "components/AccessDenied.tsx", "components/AppSidebar.tsx", "components/MobileBottomNav.tsx",
    "pages/discounts/Portfolio.tsx", "pages/AcFunnelMetrics.tsx", "pages/Pipeline.tsx", "pages/Goals.tsx", "pages/ChatwootAudit.tsx",
    "pages/CampaignPlanning.tsx", "components/precificacao/VersionHistory.tsx", "pages/StripeConversions.tsx",
    "components/precificacao/SavedProposalsList.tsx", "pages/Team.tsx", "pages/Users.tsx", "pages/ActiveCampaignIntegration.tsx",
    "pages/CsPortfolio.tsx", "pages/Commissions.tsx", "pages/CommercialPlanning.tsx", "pages/Comissionamento.tsx",
    "pages/ChurnAnalysis.tsx", "components/cs-portfolio/TaskList.tsx", "components/goals/GoalsTracking.tsx",
    "components/goals/GoalsBreakdownByCategory.tsx", "components/goals/OperationalGoals.tsx", "components/chatwoot/CsatSection.tsx",
    "components/goals/tactical/TacticalTracking.tsx", "components/comissionamento/ComissionamentoOverview.tsx",
    "components/comissionamento/ComissionamentoConversions.tsx",
  ]);
  it("nenhum arquivo novo decide acesso comparando papel direto", () => {
    const offenders = files.filter((f) => !LEGACY.has(f.p) && /role\s*[!=]==\s*["'](admin|tatico|seller)["']/.test(f.s)).map((f) => f.p);
    expect(offenders).toEqual([]);
  });
});
