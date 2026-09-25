import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DbProvider } from "@/integrations/dbContext";
import { OperationalGoals } from "@/components/goals/OperationalGoals";

const URL_BASE = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const REFRESH_MS = 5 * 60 * 1000;

function makeTvClient(area: "sales" | "cs", token: string) {
  const tvFetch: typeof fetch = async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(raw);
    if (!url.pathname.startsWith("/rest/v1/")) return fetch(input, init);
    return fetch(`${URL_BASE}/functions/v1/tv-scoreboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
      body: JSON.stringify({
        token,
        area,
        path: url.pathname + url.search,
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : undefined,
      }),
      signal: init?.signal,
    });
  };
  return createClient<Database>(URL_BASE, ANON, {
    global: { fetch: tvFetch },
    auth: { persistSession: false, autoRefreshToken: false, storageKey: `tv-${area}` },
  });
}

export default function TvScoreboard() {
  const { area, token } = useParams();
  const valid = (area === "sales" || area === "cs") && !!token;
  const client = useMemo(() => (valid ? makeTvClient(area as "sales" | "cs", token!) : null), [valid, area, token]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  if (!client) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">Link inválido.</div>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 [zoom:1.35]">
      <div className="w-full">
        <DbProvider client={client as any}>
          <OperationalGoals key={tick} tvArea={area as "sales" | "cs"} />
        </DbProvider>
      </div>
    </div>
  );
}
