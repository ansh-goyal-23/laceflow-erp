import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { store } from "@/lib/store";
import type { Session } from "@supabase/supabase-js";

interface AuthUser {
  id: string;
  email: string;
  role: "admin";
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
  return { id: s.user.id, email: s.user.email ?? "", role: "admin" };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = fromSession(session);
      setUser(u);
      if (u) {
        // fire and forget hydration
        void store.hydrate();
      } else {
        store.reset();
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      const u = fromSession(data.session);
      setUser(u);
      if (u) void store.hydrate();
      setReady(true);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  return <Ctx.Provider value={{ user, ready, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}