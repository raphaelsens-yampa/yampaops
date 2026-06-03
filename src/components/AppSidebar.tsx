import {
  BarChart3, Users, Target, Kanban, Contact, Sun, Moon, LogOut, TrendingUp,
  ShieldCheck, User, DollarSign, Upload, Link2, Plug, Activity, ChevronDown, MessageCircle,
  FileBarChart, Tag, PieChart, Sparkles, Megaphone, Headset, Percent, Briefcase, Settings2,
  Calculator,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink } from "@/components/NavLink";
import { useAuth, type CrmAreaKey } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type NavItem = {
  title: string;
  url: string;
  icon: any;
  area?: CrmAreaKey;
  adminOnly?: boolean;
  managerOnly?: boolean;
  rightSlot?: "ac-status" | "stripe-status" | "chatwoot-status";
  children?: NavItem[];
};

type Group = {
  key: string;
  label: string;
  items: NavItem[];
  collapsible?: boolean;
  defaultOpen?: boolean;
  adminOnly?: boolean;
};

function useLocalBool(key: string, def: boolean) {
  const [val, setVal] = useState<boolean>(() => {
    if (typeof window === "undefined") return def;
    const v = localStorage.getItem(key);
    return v === null ? def : v === "1";
  });
  useEffect(() => {
    localStorage.setItem(key, val ? "1" : "0");
  }, [key, val]);
  return [val, setVal] as const;
}

function ACStatusDot() {
  const { data } = useQuery({
    queryKey: ["ac-sidebar-status"],
    queryFn: async () => {
      const { data } = await supabase
        .from("integration_settings")
        .select("sync_status, last_full_sync_at")
        .maybeSingle();
      return data;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const status = data?.sync_status;
  const cls =
    status === "running"
      ? "bg-primary animate-pulse"
      : status === "error"
      ? "bg-destructive"
      : data?.last_full_sync_at
      ? "bg-success"
      : "bg-sidebar-foreground/30";

  const title =
    status === "running"
      ? "Sincronização em andamento"
      : status === "error"
      ? "Última sincronização falhou"
      : data?.last_full_sync_at
      ? "Sincronização ativa"
      : "Nunca sincronizado";

  return (
    <span
      title={title}
      className={cn("ml-auto h-2 w-2 rounded-full shrink-0", cls)}
      aria-label={title}
    />
  );
}

function StripeStatusDot() {
  const { role } = useAuth();
  const { data } = useQuery({
    queryKey: ["stripe-sidebar-status"],
    enabled: role === "admin",
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("stripe-test-connection");
      if (error) return { ok: false } as { ok: boolean; webhook_secret_configured?: boolean };
      return data as { ok: boolean; webhook_secret_configured?: boolean };
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const ok = !!data?.ok;
  const cls = ok ? "bg-success" : "bg-destructive";
  const title = ok
    ? data?.webhook_secret_configured
      ? "Stripe conectado e webhook validado"
      : "Stripe conectado (webhook sem validação)"
    : "Stripe desconectado";

  return (
    <span
      title={title}
      className={cn("ml-auto h-2 w-2 rounded-full shrink-0", cls)}
      aria-label={title}
    />
  );
}

function ChatwootStatusDot() {
  const { data } = useQuery({
    queryKey: ["chatwoot-sidebar-status"],
    queryFn: async () => {
      const { data } = await supabase
        .from("integration_settings")
        .select("chatwoot_last_event_at, chatwoot_base_url")
        .maybeSingle();
      return data;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const lastEvent = data?.chatwoot_last_event_at ? new Date(data.chatwoot_last_event_at).getTime() : 0;
  const recent = lastEvent && Date.now() - lastEvent < 24 * 60 * 60 * 1000;
  const configured = !!data?.chatwoot_base_url;

  const cls = recent
    ? "bg-success"
    : configured
    ? "bg-warning"
    : "bg-destructive";

  const title = recent
    ? `Último evento: ${new Date(lastEvent).toLocaleString("pt-BR")}`
    : configured
    ? "Configurado, aguardando eventos do webhook"
    : "Não configurado";

  return (
    <span
      title={title}
      className={cn("ml-auto h-2 w-2 rounded-full shrink-0", cls)}
      aria-label={title}
    />
  );
}

const NAV_ACTIVE = "bg-sidebar-accent text-sidebar-primary font-medium border-l-2 border-sidebar-primary";
const NAV_BASE = "hover:bg-sidebar-accent/50 border-l-2 border-transparent";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { role, profile, signOut, canView, accessLevelName } = useAuth();
  const { theme, toggle } = useTheme();

  const [openOverview, setOpenOverview] = useLocalBool("sidebar:group:overview", true);
  const [openVendas, setOpenVendas] = useLocalBool("sidebar:group:vendas", true);
  const [openComercial, setOpenComercial] = useLocalBool("sidebar:group:comercial", true);
  const [openDescontos, setOpenDescontos] = useLocalBool("sidebar:group:descontos", true);
  const [openGestao, setOpenGestao] = useLocalBool("sidebar:group:gestao", false);
  const [openIntegr, setOpenIntegr] = useLocalBool("sidebar:group:integracoes", false);
  const [openAuditoria, setOpenAuditoria] = useLocalBool(
    "sidebar:item:auditoria",
    typeof window !== "undefined" && window.location.pathname.startsWith("/atendimentos/auditoria"),
  );

  // Definição declarativa dos grupos
  const groups: Group[] = [
    {
      key: "overview",
      label: "Visão Geral",
      collapsible: true,
      defaultOpen: openOverview,
      items: [
        role === "seller"
          ? { title: "Meu Pipeline", url: "/", icon: Kanban }
          : { title: "Dashboard", url: "/", icon: BarChart3, area: "dashboard" },
        { title: "Forecast", url: "/forecast", icon: TrendingUp, area: "forecast" },
        { title: "Metas", url: "/goals", icon: Target, area: "goals" },
        { title: "Conversões por Área", url: "/insights/conversions", icon: PieChart },
      ],
    },
    {
      key: "vendas",
      label: "Operações",
      collapsible: true,
      defaultOpen: openVendas,
      items: [
        { title: "Pipeline", url: "/pipeline", icon: Kanban, area: "pipeline" },
        { title: "Atendimentos", url: "/atendimentos", icon: MessageCircle, area: "atendimentos" },
        { title: "Atividade de Agentes", url: "/atividade-agentes", icon: Headset, managerOnly: true },
        {
          title: "Auditoria IA",
          url: "/atendimentos/auditoria",
          icon: Sparkles,
          area: "auditoria_ia",
          children: [
            ...(role === "admin" ? [
              { title: "Fila de Revisão", url: "/atendimentos/auditoria/revisao", icon: Sparkles, adminOnly: true },
              { title: "Insights", url: "/atendimentos/auditoria/insights", icon: Sparkles, adminOnly: true },
              { title: "Golden Set", url: "/atendimentos/auditoria/golden-set", icon: Sparkles, adminOnly: true },
            ] : []),
            ...(role === "seller" ? [
              { title: "Minhas Auditorias", url: "/atendimentos/auditoria/minhas", icon: Sparkles, area: "auditoria_ia" as CrmAreaKey },
            ] : []),
          ],
        },
        { title: "Jornada do Lead", url: "/insights/lead-journey", icon: TrendingUp, area: "dashboard" },
      ],
    },
    {
      key: "comercial",
      label: "Sales",
      collapsible: true,
      defaultOpen: openComercial,
      items: [
        { title: "Campanhas de Sales", url: "/sales-campaigns", icon: Megaphone, managerOnly: true },
        { title: "Comissões", url: "/commissions", icon: DollarSign, area: "commissions" },
        { title: "Gerador de Ofertas", url: "/link-builder", icon: Link2 },
      ],
    },
    {
      key: "descontos",
      label: "Estratégia Adquirência",
      collapsible: true,
      defaultOpen: openDescontos,
      items: [
        { title: "Visão Geral", url: "/discounts/overview", icon: Percent, managerOnly: true },
        { title: "Minha Carteira", url: "/discounts/portfolio", icon: Briefcase },
        { title: "Configurar Faixas", url: "/discounts/rules", icon: Settings2, adminOnly: true },
      ],
    },
    {
      key: "gestao",
      label: "Gestão",
      collapsible: true,
      defaultOpen: openGestao,
      adminOnly: true,
      items: [
        { title: "Contatos", url: "/contacts", icon: Contact, area: "contacts" },
        { title: "Equipe", url: "/team", icon: Users, area: "team" },
        { title: "Usuários & Acessos", url: "/users", icon: ShieldCheck, area: "users" },
        { title: "Importação", url: "/imports", icon: Upload, area: "import" },
        { title: "Tags", url: "/settings/tags", icon: Tag, adminOnly: true },
      ],
    },
    {
      key: "integracoes",
      label: "Integrações",
      collapsible: true,
      defaultOpen: openIntegr,
      adminOnly: true,
      items: [
        { title: "ActiveCampaign", url: "/integrations/active-campaign", icon: Plug, adminOnly: true, rightSlot: "ac-status" },
        { title: "Stripe", url: "/integrations/stripe", icon: DollarSign, adminOnly: true, rightSlot: "stripe-status" },
        { title: "Chatwoot", url: "/integrations/chatwoot", icon: MessageCircle, adminOnly: true, rightSlot: "chatwoot-status" },
        { title: "Auditoria", url: "/integrations/audit", icon: Activity, adminOnly: true },
      ],
    },
  ];

  // Filtra itens visíveis em cada grupo
  const visibleGroups = groups
    .filter((g) => !g.adminOnly || role === "admin")
    .map((g) => ({
      ...g,
      items: g.items
        .filter((it) => {
          if (it.adminOnly && role !== "admin") return false;
          if (it.managerOnly && role !== "admin" && role !== "tatico") return false;
          if (!it.area) return true;
          return role === "admin" ? true : canView(it.area);
        })
        .map((it) => ({
          ...it,
          children: it.children?.filter((c) => {
            if (c.adminOnly && role !== "admin") return false;
            if (!c.area) return true;
            return role === "admin" ? true : canView(c.area);
          }),
        })),
    }))
    .filter((g) => g.items.length > 0);

  // Badge do nível de acesso
  const levelLabel = accessLevelName || (role === "admin" ? "Administrador" : role === "tatico" ? "Tático" : "Vendedor");
  const levelBgClass =
    role === "admin" ? "bg-primary" : role === "tatico" ? "bg-secondary" : "bg-muted-foreground";

  // Iniciais do usuário para avatar fallback
  const initials = (profile?.full_name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  const renderItem = (item: NavItem) => {
    const hasChildren = !!item.children && item.children.length > 0;

    if (hasChildren && !collapsed) {
      return (
        <SidebarMenuItem key={item.title}>
          <div className="flex items-center w-full">
            <SidebarMenuButton asChild tooltip={undefined} className="flex-1">
              <NavLink
                to={item.url}
                end
                className={NAV_BASE}
                activeClassName={NAV_ACTIVE}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.title}</span>
              </NavLink>
            </SidebarMenuButton>
            <button
              type="button"
              onClick={() => setOpenAuditoria(!openAuditoria)}
              className="p-1 mr-1 rounded hover:bg-sidebar-accent/50 text-sidebar-foreground/70"
              aria-label={openAuditoria ? "Recolher" : "Expandir"}
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", openAuditoria ? "rotate-0" : "-rotate-90")} />
            </button>
          </div>
          {openAuditoria && (
            <div className="ml-4 border-l border-sidebar-border/60 pl-1 mt-0.5">
              <SidebarMenu>{item.children!.map(renderItem)}</SidebarMenu>
            </div>
          )}
        </SidebarMenuItem>
      );
    }

    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild tooltip={collapsed ? item.title : undefined}>
          <NavLink
            to={item.url}
            end
            className={NAV_BASE}
            activeClassName={NAV_ACTIVE}
          >
            <item.icon className="h-4 w-4" />
            <span>{item.title}</span>
            {!collapsed && item.rightSlot === "ac-status" && <ACStatusDot />}
            {!collapsed && item.rightSlot === "stripe-status" && <StripeStatusDot />}
            {!collapsed && item.rightSlot === "chatwoot-status" && <ChatwootStatusDot />}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Header / Brand */}
        <SidebarGroup>
          <div className={cn("flex items-center py-4", collapsed ? "justify-center px-0" : "gap-2 px-3")}>
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
              <span className="text-sidebar-primary-foreground font-heading font-bold text-sm">Y</span>
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-heading font-bold text-lg text-sidebar-foreground leading-none">Yampa</span>
              </div>
            )}
          </div>
          {!collapsed && (
            <div className="px-3 pb-2">
              <Badge className={cn("text-[10px] uppercase tracking-wide text-white border-transparent hover:opacity-90", levelBgClass)}>
                {levelLabel}
              </Badge>
            </div>
          )}
        </SidebarGroup>

        {/* Grupos */}
        {(() => {
          const groupStateMap: Record<string, [boolean, (v: boolean) => void]> = {
            overview: [openOverview, setOpenOverview],
            vendas: [openVendas, setOpenVendas],
            comercial: [openComercial, setOpenComercial],
            descontos: [openDescontos, setOpenDescontos],
            gestao: [openGestao, setOpenGestao],
            integracoes: [openIntegr, setOpenIntegr],
          };

          return visibleGroups.map((g) => {
            if (!collapsed && g.collapsible) {
              const [open, setOpen] = groupStateMap[g.key] ?? [true, () => {}];
              return (
                <Collapsible key={g.key} open={open} onOpenChange={setOpen}>
                  <SidebarGroup>
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
                      >
                        <span className="uppercase tracking-wide">{g.label}</span>
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 transition-transform",
                            open ? "rotate-0" : "-rotate-90",
                          )}
                        />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarGroupContent>
                        <SidebarMenu>{g.items.map(renderItem)}</SidebarMenu>
                      </SidebarGroupContent>
                    </CollapsibleContent>
                  </SidebarGroup>
                </Collapsible>
              );
            }

            return (
              <SidebarGroup key={g.key}>
                {!collapsed && <SidebarGroupLabel>{g.label}</SidebarGroupLabel>}
                <SidebarGroupContent>
                  <SidebarMenu>{g.items.map(renderItem)}</SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          });
        })()}
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className={cn("space-y-2 border-t border-sidebar-border", collapsed ? "items-center px-0 py-3" : "p-3")}>
        {!collapsed ? (
          <div className="flex items-center gap-2 px-1">
            <Avatar className="h-8 w-8">
              {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.full_name || ""} />}
              <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs">
                {initials || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0 flex-1">
              <p className="text-xs font-medium text-sidebar-foreground truncate">
                {profile?.full_name || "Usuário"}
              </p>
              <p className="text-[10px] text-sidebar-foreground/60 truncate">{levelLabel}</p>
            </div>
          </div>
        ) : (
          <Avatar className="h-8 w-8" title={profile?.full_name || ""}>
            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.full_name || ""} />}
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs">
              {initials || "?"}
            </AvatarFallback>
          </Avatar>
        )}
        <div className={cn("flex", collapsed ? "flex-col items-center gap-1" : "gap-1")}>
          <SidebarMenuButton asChild tooltip={collapsed ? "Perfil" : undefined}>
            <NavLink to="/profile" className="hover:bg-sidebar-accent/50 h-8 w-8 flex items-center justify-center" activeClassName="bg-sidebar-accent text-sidebar-primary">
              <User className="h-4 w-4" />
            </NavLink>
          </SidebarMenuButton>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            className="text-sidebar-foreground hover:bg-sidebar-accent h-8 w-8"
            title={theme === "light" ? "Modo escuro" : "Modo claro"}
          >
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            className="text-sidebar-foreground hover:bg-sidebar-accent h-8 w-8"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
