import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { PageHeader } from "@/components/page-header";
import { POForm } from "@/components/po-form";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/purchase-orders/$id/edit")({
  component: EditPO,
});

function EditPO() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const po = useStore((s) => s.purchaseOrders.find((p) => p.id === id));

  useEffect(() => {
    if (po === undefined) {
      // not found after store hydrated — go back
      const t = setTimeout(() => navigate({ to: "/purchase-orders", replace: true }), 200);
      return () => clearTimeout(t);
    }
  }, [po, navigate]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title={`Edit PO ${po?.poNumber ?? ""}`.trim()}
        subtitle="Modify and resubmit"
        actions={
          <Button variant="outline" asChild>
            <Link to="/purchase-orders"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Link>
          </Button>
        }
      />
      {po ? <POForm existing={po} /> : <div className="text-sm text-muted-foreground">Loading…</div>}
    </div>
  );
}