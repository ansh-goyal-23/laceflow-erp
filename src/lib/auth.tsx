import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { store } from "@/lib/store";
import { logActivity } from "@/lib/audit";
import type { Session } from "@supabase/supabase-js";

interface AuthUser {
  id: string;
  email: string;
  role: "admin" | "user";
}

interface AuthCtx {
  user: AuthUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

function fromSession(s: Session | null): AuthUser | null {
  if (!s?.user) return null;
  return { id: s.user.id, email: s.user.email ?? "", role: "user" };
}

async function fetchRole(userId: string): Promise<"admin" | "user"> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return data ? "admin" : "user";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const apply = async (session: Session | null) => {
      const u = fromSession(session);
      if (u) {
        const role = await fetchRole(u.id).catch(() => "user" as const);
        setUser({ ...u, role });
        void store.hydrate();
      } else {
        setUser(null);
        store.reset();
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      void apply(session);
    });

    supabase.auth.getSession().then(async ({ data }) => {
      await apply(data.session);
      setReady(true);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };
    void logActivity("Auth", "LOGIN", "Session", email);
    return { ok: true };
  };

  const logout = async () => {
    await logActivity("Auth", "LOGOUT", "Session", user?.email ?? null);
    await supabase.auth.signOut();
  };

  return <Ctx.Provider value={{ user, ready, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}