import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { SalesReturnForm } from "@/components/sales-return-form";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/sales-returns/$id/edit")({
  component: EditSalesReturn,
});

function EditSalesReturn() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const ret = useStore((s) => s.salesReturns.find((r) => r.id === id));
  const { user } = useAuth();
  const allowed = !!ret && !!user && (user.role === "admin" || ret.createdBy === user.id);

  useEffect(() => {
    if (ret && user && !allowed) navigate({ to: "/sales-returns", replace: true });
  }, [ret, user, allowed, navigate]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title={`Edit Sales Return ${ret?.returnNumber ?? ""}`.trim()}
        subtitle="Modify returned items"
        actions={
          <Button variant="outline" asChild>
            <Link to="/sales-returns"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Link>
          </Button>
        }
      />
      {ret && allowed ? <SalesReturnForm existing={ret} /> : <div className="text-sm text-muted-foreground">Loading…</div>}
    </div>
  );
}
