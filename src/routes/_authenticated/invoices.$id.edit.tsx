import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { InvoiceForm } from "@/components/invoice-form";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/invoices/$id/edit")({
  component: EditInvoice,
});

function EditInvoice() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const inv = useStore((s) => s.invoices.find((i) => i.id === id));
  const { user } = useAuth();
  const allowed = !!inv && !!user && (user.role === "admin" || inv.createdBy === user.id);

  useEffect(() => {
    if (inv === undefined) {
      const t = setTimeout(() => navigate({ to: "/invoices", replace: true }), 200);
      return () => clearTimeout(t);
    }
    if (inv && user && !allowed) navigate({ to: "/invoices", replace: true });
  }, [inv, navigate, user, allowed]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title={`Edit Invoice ${inv?.invoiceNumber ?? ""}`.trim()}
        subtitle="Modify dispatch items"
        actions={
          <Button variant="outline" asChild>
            <Link to="/invoices"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Link>
          </Button>
        }
      />
      {inv && allowed ? <InvoiceForm existing={inv} /> : <div className="text-sm text-muted-foreground">Loading…</div>}
    </div>
  );
}