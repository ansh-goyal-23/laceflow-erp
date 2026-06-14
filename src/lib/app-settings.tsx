import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type SettingsMap = {
  allow_user_pdf_import: boolean;
};

const DEFAULTS: SettingsMap = {
  allow_user_pdf_import: false,
};

interface AppSettingsCtx {
  settings: SettingsMap;
  ready: boolean;
  setSetting: <K extends keyof SettingsMap>(key: K, value: SettingsMap[K]) => Promise<{ ok: boolean; error?: string }>;
}

const Ctx = createContext<AppSettingsCtx | null>(null);

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SettingsMap>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const apply = (rows: Array<{ key: string; value: unknown }>) => {
      const next: SettingsMap = { ...DEFAULTS };
      for (const r of rows) {
        if (r.key in DEFAULTS) {
          (next as Record<string, unknown>)[r.key] = r.value;
        }
      }
      if (!cancelled) setSettings(next);
    };

    void supabase
      .from("app_settings")
      .select("key,value")
      .then(({ data }) => {
        apply((data as Array<{ key: string; value: unknown }>) ?? []);
        if (!cancelled) setReady(true);
      });

    const channel = supabase
      .channel("app_settings_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings" },
        () => {
          void supabase
            .from("app_settings")
            .select("key,value")
            .then(({ data }) => apply((data as Array<{ key: string; value: unknown }>) ?? []));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, []);

  const setSetting: AppSettingsCtx["setSetting"] = async (key, value) => {
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key, value: value as unknown as never, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return { ok: false, error: error.message };
    setSettings((s) => ({ ...s, [key]: value }));
    return { ok: true };
  };

  return <Ctx.Provider value={{ settings, ready, setSetting }}>{children}</Ctx.Provider>;
}

export function useAppSettings() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppSettings must be used inside AppSettingsProvider");
  return v;
}