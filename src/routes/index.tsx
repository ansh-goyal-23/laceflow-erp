import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const { user, ready } = useAuth();
  useEffect(() => {
    if (!ready) return;
    navigate({ to: user ? "/dashboard" : "/login", replace: true });
  }, [ready, user, navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-muted-foreground text-sm">Loading Shree Lace ERP…</div>
    </div>
  );
}
