import {
  BarChart3, Users, Target, Kanban, Contact, Sun, Moon, LogOut, TrendingUp, ShieldCheck, User, DollarSign, Upload,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

type NavItem = { title: string; url: string; icon: any; area?: string };

// Itens "core" liberados a todos os autenticados (não dependem de permissão)
const coreItems: NavItem[] = [
  { title: "Comissões", url: "/commissions", icon: DollarSign, area: "commissions" },
];

// Itens controlados pelo Nível de Acesso (área → menu)
const guardedItems: NavItem[] = [
  { title: "Dashboard", url: "/", icon: BarChart3, area: "dashboard" },
  { title: "Pipeline", url: "/pipeline", icon: Kanban, area: "pipeline" },
  { title: "Forecast", url: "/forecast", icon: TrendingUp, area: "forecast" },
  { title: "Metas", url: "/goals", icon: Target, area: "goals" },
  { title: "Equipe", url: "/team", icon: Users, area: "team" },
  { title: "Contatos", url: "/contacts", icon: Contact, area: "contacts" },
  { title: "Importação", url: "/imports", icon: Upload, area: "import" },
  { title: "Usuários", url: "/users", icon: ShieldCheck, area: "users" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { role, profile, signOut, canView, accessLevelName } = useAuth();
  const { theme, toggle } = useTheme();

  // Admin sempre vê tudo; demais filtram por permissão de visualização
  const visibleGuarded = guardedItems.filter((it) =>
    role === "admin" ? true : canView(it.area as any),
  );
  // Seller sem dashboard liberada → mostra "Meu Pipeline" como home
  const items: NavItem[] = [...visibleGuarded, ...coreItems.filter((it) =>
    role === "admin" ? true : canView(it.area as any),
  )];

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <div className={`flex items-center py-4 ${collapsed ? 'justify-center px-0' : 'gap-2 px-3'}`}>
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
              <span className="text-sidebar-primary-foreground font-heading font-bold text-sm">Y</span>
            </div>
            {!collapsed && (
              <span className="font-heading font-bold text-lg text-sidebar-foreground">Yampa</span>
            )}
          </div>
          <SidebarGroupLabel>{accessLevelName || (role === "admin" ? "Gerencial" : "Vendedor")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className={`space-y-2 ${collapsed ? 'items-center px-0 py-3' : 'p-3'}`}>
        {!collapsed && profile?.full_name && (
          <p className="text-xs text-sidebar-foreground/70 truncate px-1">{profile.full_name}</p>
        )}
        <div className={`flex ${collapsed ? 'flex-col items-center gap-1' : 'gap-1'}`}>
          <SidebarMenuButton asChild>
            <NavLink to="/profile" className="hover:bg-sidebar-accent/50 h-8 w-8 flex items-center justify-center" activeClassName="bg-sidebar-accent text-sidebar-primary">
              <User className="h-4 w-4" />
            </NavLink>
          </SidebarMenuButton>
          <Button variant="ghost" size="icon" onClick={toggle} className="text-sidebar-foreground hover:bg-sidebar-accent h-8 w-8">
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={signOut} className="text-sidebar-foreground hover:bg-sidebar-accent h-8 w-8">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
