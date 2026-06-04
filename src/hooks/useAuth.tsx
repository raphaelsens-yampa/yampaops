import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { CRM_SECTIONS, getSectionForArea, type CrmAreaKey, type AreaPermission, type Permissions, type SectionKey } from "@/components/AccessLevelManager";

type AppRole = Database["public"]["Enums"]["app_role"];

export type { CrmAreaKey, AreaPermission, Permissions, SectionKey };

interface AuthContext {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  profile: { full_name: string | null; avatar_url: string | null } | null;
  permissions: Permissions;
  accessLevelName: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  canView: (area: CrmAreaKey) => boolean;
  canCreate: (area: CrmAreaKey) => boolean;
  canEdit: (area: CrmAreaKey) => boolean;
  canViewSection: (section: SectionKey) => boolean;
}

const EMPTY_PERMS: Permissions = {};

const AuthCtx = createContext<AuthContext>({
  session: null, user: null, role: null, profile: null,
  permissions: EMPTY_PERMS, accessLevelName: null, loading: true,
  signOut: async () => {},
  canView: () => false, canCreate: () => false, canEdit: () => false,
  canViewSection: () => false,
});

export const useAuth = () => useContext(AuthCtx);

// Constrói defaults baseados no papel; mantém compatibilidade com bases antigas
// onde a access_level não inclui novas chaves.
function defaultsForRole(role: AppRole): Permissions {
  const all: AreaPermission = { view: true, create: true, edit: true };
  const ro: AreaPermission = { view: true, create: false, edit: false };
  const none: AreaPermission = { view: false, create: false, edit: false };

  if (role === "admin") {
    const p: Permissions = {};
    for (const s of CRM_SECTIONS) {
      p[s.key as CrmAreaKey] = all;
      for (const a of s.areas) p[a.key as CrmAreaKey] = all;
    }
    return p;
  }

  if (role === "tatico") {
    return {
      overview: ro, dashboard: ro, forecast: ro, goals: ro, conversions: ro,
      operations: ro, pipeline: { view: true, create: true, edit: true }, atendimentos: ro,
      agent_activity: ro, auditoria_ia: ro, lead_journey: ro,
      sales: ro, sales_campaigns: ro, commissions: ro, link_builder: ro, precificacao: ro,
      discounts: ro, discounts_overview: ro, discounts_portfolio: ro, discounts_rules: none,
      gestao: ro, contacts: { view: true, create: true, edit: true }, team: ro, users: none, import: ro, tags: none,
      integracoes: none, integration_ac: none, integration_stripe: none, integration_chatwoot: none, integration_audit: none,
    };
  }

  // seller
  return {
    overview: ro, dashboard: none, forecast: none, goals: ro, conversions: none,
    operations: ro, pipeline: { view: true, create: true, edit: true }, atendimentos: ro,
    agent_activity: none, auditoria_ia: ro, lead_journey: none,
    sales: ro, sales_campaigns: none, commissions: ro, link_builder: ro, precificacao: ro,
    discounts: ro, discounts_overview: none, discounts_portfolio: ro, discounts_rules: none,
    gestao: none, contacts: none, team: none, users: none, import: none, tags: none,
    integracoes: none, integration_ac: none, integration_stripe: none, integration_chatwoot: none, integration_audit: none,
  };
}

// Mescla permissões do nível de acesso com defaults do papel: chaves não definidas
// no nível herdam o valor do default do papel (compat. retroativa).
function mergePermissions(levelPerms: Permissions | null | undefined, role: AppRole): Permissions {
  const defaults = defaultsForRole(role);
  if (!levelPerms) return defaults;
  const merged: Permissions = { ...defaults };
  for (const [k, v] of Object.entries(levelPerms)) {
    if (v) merged[k as CrmAreaKey] = v as AreaPermission;
  }
  return merged;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<AuthContext["profile"]>(null);
  const [permissions, setPermissions] = useState<Permissions>(EMPTY_PERMS);
  const [accessLevelName, setAccessLevelName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => fetchUserData(s.user.id), 0);
      } else {
        setRole(null);
        setProfile(null);
        setPermissions(EMPTY_PERMS);
        setAccessLevelName(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchUserData(s.user.id);
      else setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchUserData(userId: string) {
    const [rolesRes, profileRes, accessRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).limit(1).single(),
      supabase.from("profiles").select("full_name, avatar_url").eq("user_id", userId).limit(1).single(),
      supabase
        .from("user_access_levels")
        .select("access_level_id, access_levels(name, permissions)")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
    ]);
    const resolvedRole = (rolesRes.data?.role as AppRole) ?? "seller";
    setRole(resolvedRole);
    setProfile(profileRes.data ?? null);

    const level = (accessRes.data as any)?.access_levels;
    setPermissions(mergePermissions(level?.permissions as Permissions | undefined, resolvedRole));
    setAccessLevelName(level?.name ?? null);
    setLoading(false);
  }

  const signOut = async () => { await supabase.auth.signOut(); };

  // Admin sempre tem acesso total
  const isAdmin = role === "admin";

  const canViewSection = (section: SectionKey) => {
    if (isAdmin) return true;
    return !!permissions[section as CrmAreaKey]?.view;
  };

  const checkArea = (area: CrmAreaKey, perm: keyof AreaPermission) => {
    if (isAdmin) return true;
    // Se a área pertence a uma seção, a seção precisa estar habilitada
    const section = getSectionForArea(area);
    if (section && section !== area) {
      if (!permissions[section as CrmAreaKey]?.view) return false;
    }
    return !!permissions[area]?.[perm];
  };

  const canView = (area: CrmAreaKey) => checkArea(area, "view");
  const canCreate = (area: CrmAreaKey) => checkArea(area, "create");
  const canEdit = (area: CrmAreaKey) => checkArea(area, "edit");

  return (
    <AuthCtx.Provider
      value={{
        session, user, role, profile,
        permissions, accessLevelName, loading,
        signOut, canView, canCreate, canEdit, canViewSection,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}
