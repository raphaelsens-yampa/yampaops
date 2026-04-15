import {
  BarChart3, Users, Target, Kanban, FileUp, Sun, Moon, LogOut, ChevronLeft, TrendingUp, ShieldCheck,
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

const adminItems = [
  { title: "Dashboard", url: "/", icon: BarChart3 },
  { title: "Pipeline", url: "/pipeline", icon: Kanban },
  { title: "Forecast", url: "/forecast", icon: TrendingUp },
  { title: "Metas", url: "/goals", icon: Target },
  { title: "Equipe", url: "/team", icon: Users },
  { title: "Importar", url: "/import", icon: FileUp },
  { title: "Usuários", url: "/users", icon: ShieldCheck },
];

const sellerItems = [
  { title: "Meu Pipeline", url: "/", icon: Kanban },
  { title: "Minhas Metas", url: "/goals", icon: Target },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { role, profile, signOut } = useAuth();
  const { theme, toggle } = useTheme();

  const items = role === "admin" ? adminItems : sellerItems;

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center gap-2 px-3 py-4">
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
              <span className="text-sidebar-primary-foreground font-heading font-bold text-sm">Y</span>
            </div>
            {!collapsed && (
              <span className="font-heading font-bold text-lg text-sidebar-foreground">Yampa</span>
            )}
          </div>
          <SidebarGroupLabel>{role === "admin" ? "Gerencial" : "Vendedor"}</SidebarGroupLabel>
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
      <SidebarFooter className="p-3 space-y-2">
        {!collapsed && profile?.full_name && (
          <p className="text-xs text-sidebar-foreground/70 truncate px-1">{profile.full_name}</p>
        )}
        <div className="flex gap-1">
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
