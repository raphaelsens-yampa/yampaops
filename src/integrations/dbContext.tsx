import { createContext, useContext, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type Db = typeof supabase;

// Permite trocar o cliente de dados (ex.: tela de TV pública via link secreto).
const DbContext = createContext<Db>(supabase);

export function DbProvider({ client, children }: { client: Db; children: ReactNode }) {
  return <DbContext.Provider value={client}>{children}</DbContext.Provider>;
}

export function useDb(): Db {
  return useContext(DbContext);
}
