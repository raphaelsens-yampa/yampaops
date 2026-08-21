import { useEffect, useState } from "react";
import { SCENARIO_STORAGE_KEY } from "@/lib/goalScenario";

const EVENT = "goal-scenario-change";

function read(): number {
  try {
    const raw = localStorage.getItem(SCENARIO_STORAGE_KEY);
    const n = raw ? Number(raw) : 0;
    return isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Cenário de crescimento simulado nas Metas (0 = metas cadastradas).
 * Simulação local: persiste no navegador do usuário e sincroniza entre abas
 * da tela via evento, sem tocar no banco.
 */
export function useGoalScenario() {
  const [growthPct, setGrowthPct] = useState<number>(read);

  useEffect(() => {
    const sync = () => setGrowthPct(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setScenario = (pct: number) => {
    const value = isFinite(pct) && pct > 0 ? pct : 0;
    try {
      if (value) localStorage.setItem(SCENARIO_STORAGE_KEY, String(value));
      else localStorage.removeItem(SCENARIO_STORAGE_KEY);
    } catch {}
    setGrowthPct(value);
    window.dispatchEvent(new Event(EVENT));
  };

  return { growthPct, setScenario, active: growthPct > 0 };
}
