import { useAuth } from "@/hooks/useAuth";
import { ReactNode } from "react";
import { AccessDenied } from "@/components/AccessDenied";

export function ManagerOnly({ children }: { children: ReactNode }) {
  const { role, loading } = useAuth();
  if (loading) return null;
  if (role !== "admin" && role !== "tatico") return <AccessDenied />;
  return <>{children}</>;
}
