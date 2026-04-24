import {
  BarChart3, Users, Target, Kanban, Contact, Sun, Moon, LogOut, TrendingUp,
  ShieldCheck, User, DollarSign, Upload, Link2, Plug, Activity, ChevronDown,
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
  rightSlot?: "ac-status" | "stripe-status";
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

const NAV_ACTIVE = "bg-sidebar-accent text-sidebar-primary font-medium border-l-2 border-sidebar-primary";
const NAV_BASE = "hover:bg-sidebar-accent/50 border-l-2 border-transparent";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { role, profile, signOut, canView, accessLevelName } = useAuth();
  const { theme, toggle } = useTheme();

  const [openGestao, setOpenGestao] = useLocalBool("sidebar:group:gestao", false);
  const [openIntegr, setOpenIntegr] = useLocalBool("sidebar:group:integracoes", false);

  // Definição declarativa dos grupos
  const groups: Group[] = [
    {
      key: "overview",
      label: "Visão Geral",
      items: [
        role === "seller"
          ? { title: "Meu Pipeline", url: "/", icon: Kanban }
          : { title: "Dashboard", url: "/", icon: BarChart3, area: "dashboard" },
        { title: "Forecast", url: "/forecast", icon: TrendingUp, area: "forecast" },
      ],
    },
    {
      key: "vendas",
      label: "Operações",
      items: [
        { title: "Pipeline", url: "/pipeline", icon: Kanban, area: "pipeline" },
        { title: "Contatos", url: "/contacts", icon: Contact, area: "contacts" },
        { title: "Metas", url: "/goals", icon: Target, area: "goals" },
      ],
    },
    {
      key: "comercial",
      label: "Administrativo",
      items: [
        { title: "Comissões", url: "/commissions", icon: DollarSign, area: "commissions" },
        { title: "Gerador de Ofertas", url: "/link-builder", icon: Link2 },
      ],
    },
    {
      key: "gestao",
      label: "Gestão",
      collapsible: true,
      defaultOpen: openGestao,
      adminOnly: true,
      items: [
        { title: "Equipe", url: "/team", icon: Users, area: "team" },
        { title: "Usuários & Acessos", url: "/users", icon: ShieldCheck, area: "users" },
        { title: "Importação", url: "/imports", icon: Upload, area: "import" },
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
        { title: "Stripe", url: "/integrations/stripe", icon: DollarSign, adminOnly: true },
        { title: "Auditoria", url: "/integrations/audit", icon: Activity, adminOnly: true },
      ],
    },
  ];

  // Filtra itens visíveis em cada grupo
  const visibleGroups = groups
    .filter((g) => !g.adminOnly || role === "admin")
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => {
        if (it.adminOnly && role !== "admin") return false;
        if (!it.area) return true;
        return role === "admin" ? true : canView(it.area);
      }),
    }))
    .filter((g) => g.items.length > 0);

  // Badge do nível de acesso
  const levelLabel = accessLevelName || (role === "admin" ? "Gerencial" : role === "tatico" ? "Tático" : "Vendedor");
  const levelVariant: "default" | "secondary" | "outline" =
    role === "admin" ? "default" : role === "tatico" ? "secondary" : "outline";

  // Iniciais do usuário para avatar fallback
  const initials = (profile?.full_name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  const renderItem = (item: NavItem) => (
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
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

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
              <Badge variant={levelVariant} className="text-[10px] uppercase tracking-wide">
                {levelLabel}
              </Badge>
            </div>
          )}
        </SidebarGroup>

        {/* Grupos */}
        {visibleGroups.map((g) => {
          if (g.collapsible && !collapsed) {
            const open = g.key === "gestao" ? openGestao : openIntegr;
            const setOpen = g.key === "gestao" ? setOpenGestao : setOpenIntegr;
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
        })}
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
