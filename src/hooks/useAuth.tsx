import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

export type AreaPermission = { view: boolean; create: boolean; edit: boolean };
export type CrmAreaKey =
  | "dashboard"
  | "pipeline"
  | "forecast"
  | "goals"
  | "team"
  | "import"
  | "users"
  | "contacts"
  | "commissions"
  | "atendimentos"
  | "auditoria_ia";
export type Permissions = Partial<Record<CrmAreaKey, AreaPermission>>;

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
}

const EMPTY_PERMS: Permissions = {};

const AuthCtx = createContext<AuthContext>({
  session: null, user: null, role: null, profile: null,
  permissions: EMPTY_PERMS, accessLevelName: null, loading: true,
  signOut: async () => {},
  canView: () => false, canCreate: () => false, canEdit: () => false,
});

export const useAuth = () => useContext(AuthCtx);

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
      if (s?.user) {
        fetchUserData(s.user.id);
      } else {
        setLoading(false);
      }
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
    if (level?.permissions) {
      setPermissions(level.permissions as Permissions);
      setAccessLevelName(level.name ?? null);
    } else {
      // Fallback: admin vê e gerencia tudo; tático vê tudo mas não cria/edita amplo;
      // seller só pipeline/goals/commissions
      if (resolvedRole === "admin") {
        setPermissions({
          dashboard: { view: true, create: true, edit: true },
          pipeline: { view: true, create: true, edit: true },
          forecast: { view: true, create: true, edit: true },
          goals: { view: true, create: true, edit: true },
          team: { view: true, create: true, edit: true },
          import: { view: true, create: true, edit: true },
          users: { view: true, create: true, edit: true },
          contacts: { view: true, create: true, edit: true },
          commissions: { view: true, create: true, edit: true },
          atendimentos: { view: true, create: true, edit: true },
          auditoria_ia: { view: true, create: true, edit: true },
          
        });
      } else if (resolvedRole === "tatico") {
        setPermissions({
          dashboard: { view: true, create: false, edit: false },
          pipeline: { view: true, create: true, edit: true },
          forecast: { view: true, create: false, edit: false },
          goals: { view: true, create: false, edit: false },
          team: { view: true, create: false, edit: false },
          contacts: { view: true, create: true, edit: true },
          commissions: { view: true, create: false, edit: false },
          atendimentos: { view: true, create: false, edit: false },
          auditoria_ia: { view: true, create: false, edit: false },
        });
      } else {
        setPermissions({
          pipeline: { view: true, create: true, edit: true },
          goals: { view: true, create: false, edit: false },
          commissions: { view: true, create: false, edit: false },
          
        });
      }
      setAccessLevelName(null);
    }
    setLoading(false);
  }

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const canView = (area: CrmAreaKey) => !!permissions[area]?.view;
  const canCreate = (area: CrmAreaKey) => !!permissions[area]?.create;
  const canEdit = (area: CrmAreaKey) => !!permissions[area]?.edit;

  return (
    <AuthCtx.Provider
      value={{
        session, user, role, profile,
        permissions, accessLevelName, loading,
        signOut, canView, canCreate, canEdit,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}
