import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export function AdminGuard({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && user && user.role !== "admin") {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [ready, user, navigate]);

  if (!ready || !user) {
    return (
      <div className="p-8 text-sm text-muted-foreground">Loading…</div>
    );
  }
  if (user.role !== "admin") {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        This area is restricted to administrators.
      </div>
    );
  }
  return <>{children}</>;
}