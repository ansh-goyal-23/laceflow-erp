import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface AuthUser {
  username: string;
  role: "admin";
}

interface AuthCtx {
  user: AuthUser | null;
  ready: boolean;
  login: (u: string, p: string) => { ok: boolean; error?: string };
  logout: () => void;
}

const KEY = "shree_lace_erp_auth";
const ADMIN = { username: "admin", password: "admin123" };

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {
      // ignore
    }
    setReady(true);
  }, []);

  const login = (u: string, p: string) => {
    if (u === ADMIN.username && p === ADMIN.password) {
      const next: AuthUser = { username: u, role: "admin" };
      localStorage.setItem(KEY, JSON.stringify(next));
      setUser(next);
      return { ok: true };
    }
    return { ok: false, error: "Invalid username or password" };
  };

  const logout = () => {
    localStorage.removeItem(KEY);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, ready, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}