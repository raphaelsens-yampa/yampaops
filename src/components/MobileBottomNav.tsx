import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Kanban, Target, PieChart, Menu, FileBarChart, MessageCircle, Sparkles, Headset,
  Megaphone, DollarSign, Link2, Calculator, Percent, Briefcase, Settings2,
  Users, ShieldCheck, Upload, Tag, User, Sun, Moon, LogOut, X,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAuth, type CrmAreaKey, type SectionKey } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

type Item = { title: string; url: string; icon: any; area?: CrmAreaKey; adminOnly?: boolean; managerOnly?: boolean };
type Group = { label: string; section?: SectionKey; adminOnly?: boolean; items: Item[] };

export function MobileBottomNav() {
  const { pathname } = useLocation();
  const { role, profile, signOut, canView, canViewSection, accessLevelName } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);

  const primary: Item[] = useMemo(() => ([
    role === "seller"
      ? { title: "Pipeline", url: "/", icon: Kanban }
      : { title: "Diretoria", url: "/", icon: FileBarChart, area: "one_page_diretoria" },
    { title: "Metas", url: "/goals", icon: Target, area: "goals" },
    { title: "Conversões", url: "/insights/conversions", icon: PieChart, area: "conversions" },
    { title: "Atendimentos", url: "/atendimentos", icon: MessageCircle, area: "atendimentos" },
  ]), [role]);

  const visiblePrimary = primary.filter((it) => {
    if (!it.area) return true;
    return role === "admin" ? true : canView(it.area);
  });

  const groups: Group[] = [
    {
      label: "Visão Geral", section: "overview",
      items: [
        role === "seller"
          ? { title: "Meu Pipeline", url: "/", icon: Kanban }
          : { title: "OnePage Diretoria", url: "/", icon: FileBarChart, area: "one_page_diretoria" },
        { title: "Metas", url: "/goals", icon: Target, area: "goals" },
        { title: "Conversões por Área", url: "/insights/conversions", icon: PieChart, area: "conversions" },
      ],
    },
    {
      label: "Operações", section: "operations",
      items: [
        { title: "Atendimentos", url: "/atendimentos", icon: MessageCircle, area: "atendimentos" },
        { title: "Atividade de Agentes", url: "/atividade-agentes", icon: Headset, area: "agent_activity", managerOnly: true },
        { title: "Auditoria IA", url: "/atendimentos/auditoria", icon: Sparkles, area: "auditoria_ia" },
      ],
    },
    {
      label: "Sales", section: "sales",
      items: [
        { title: "Campanhas de Sales", url: "/sales-campaigns", icon: Megaphone, area: "sales_campaigns", managerOnly: true },
        { title: "Comissionamento", url: "/comissionamento", icon: DollarSign, area: "comissionamento" },
        { title: "Gerador de Ofertas", url: "/link-builder", icon: Link2, area: "link_builder" },
        { title: "Precificação Serviços", url: "/precificacao", icon: Calculator, area: "precificacao" },
      ],
    },
    {
      label: "Estratégia Adquirência", section: "discounts",
      items: [
        { title: "Visão Geral", url: "/discounts/overview", icon: Percent, area: "discounts_overview", managerOnly: true },
        { title: "Minha Carteira", url: "/discounts/portfolio", icon: Briefcase, area: "discounts_portfolio" },
        { title: "Configurar Faixas", url: "/discounts/rules", icon: Settings2, area: "discounts_rules", adminOnly: true },
      ],
    },
    {
      label: "Gestão", section: "gestao", adminOnly: true,
      items: [
        { title: "Equipe", url: "/team", icon: Users, area: "team" },
        { title: "Usuários & Acessos", url: "/users", icon: ShieldCheck, area: "users" },
        { title: "Importação", url: "/imports", icon: Upload, area: "import" },
        { title: "Tags", url: "/settings/tags", icon: Tag, area: "tags", adminOnly: true },
      ],
    },
    {
      label: "Integrações", section: "integracoes", adminOnly: true,
      items: [
        { title: "Stripe", url: "/integrations/stripe", icon: DollarSign, area: "integration_stripe", adminOnly: true },
        { title: "Chatwoot", url: "/integrations/chatwoot", icon: MessageCircle, area: "integration_chatwoot", adminOnly: true },
      ],
    },
  ];

  const visibleGroups = groups
    .filter((g) => !g.adminOnly || role === "admin")
    .filter((g) => !g.section || role === "admin" || canViewSection(g.section))
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => {
        if (it.adminOnly && role !== "admin") return false;
        if (it.managerOnly && role !== "admin" && role !== "tatico") return false;
        if (!it.area) return true;
        return role === "admin" ? true : canView(it.area);
      }),
    }))
    .filter((g) => g.items.length > 0);

  const isActive = (url: string) => pathname === url || (url !== "/" && pathname.startsWith(url));

  const levelLabel = accessLevelName || (role === "admin" ? "Administrador" : role === "tatico" ? "Tático" : "Vendedor");
  const initials = (profile?.full_name || "?").split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar text-sidebar-foreground border-t border-sidebar-border shadow-[0_-2px_10px_rgba(0,0,0,0.08)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-5 h-14">
        {visiblePrimary.slice(0, 4).map((it) => {
          const active = isActive(it.url);
          return (
            <NavLink
              key={it.url}
              to={it.url}
              end={it.url === "/"}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                active ? "text-sidebar-primary" : "text-sidebar-foreground/70 hover:text-sidebar-foreground",
              )}
            >
              <it.icon className={cn("h-5 w-5", active && "text-sidebar-primary")} />
              <span className="truncate px-1">{it.title}</span>
            </NavLink>
          );
        })}

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground"
            >
              <Menu className="h-5 w-5" />
              <span>Mais</span>
            </button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-[88vw] max-w-sm p-0 bg-sidebar text-sidebar-foreground border-sidebar-border flex flex-col"
          >
            <SheetHeader className="px-4 py-4 border-b border-sidebar-border flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
                  <span className="text-sidebar-primary-foreground font-heading font-bold text-sm">Y</span>
                </div>
                <SheetTitle className="font-heading font-bold text-lg text-sidebar-foreground truncate">Yampa</SheetTitle>
              </div>
              <SheetClose asChild>
                <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent h-8 w-8">
                  <X className="h-4 w-4" />
                </Button>
              </SheetClose>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
              {visibleGroups.map((g) => (
                <div key={g.label}>
                  <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-sidebar-foreground/60">
                    {g.label}
                  </div>
                  <ul className="space-y-0.5">
                    {g.items.map((it) => (
                      <li key={it.url}>
                        <NavLink
                          to={it.url}
                          end={it.url === "/"}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm hover:bg-sidebar-accent/60"
                          activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                        >
                          <it.icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{it.title}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="border-t border-sidebar-border p-3 space-y-2">
              <div className="flex items-center gap-2 px-1">
                <div className="h-9 w-9 rounded-full bg-sidebar-accent text-sidebar-accent-foreground flex items-center justify-center text-xs font-medium">
                  {initials || "?"}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{profile?.full_name || "Usuário"}</p>
                  <p className="text-[10px] text-sidebar-foreground/60 truncate">{levelLabel}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <NavLink
                  to="/profile"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-1 h-9 rounded-md text-xs hover:bg-sidebar-accent/60"
                  activeClassName="bg-sidebar-accent text-sidebar-primary"
                >
                  <User className="h-4 w-4" /> Perfil
                </NavLink>
                <button
                  type="button"
                  onClick={toggle}
                  className="flex items-center justify-center gap-1 h-9 rounded-md text-xs hover:bg-sidebar-accent/60"
                >
                  {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  Tema
                </button>
                <button
                  type="button"
                  onClick={() => { setOpen(false); signOut(); }}
                  className="flex items-center justify-center gap-1 h-9 rounded-md text-xs hover:bg-sidebar-accent/60"
                >
                  <LogOut className="h-4 w-4" /> Sair
                </button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
