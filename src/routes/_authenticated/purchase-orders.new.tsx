import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { POForm } from "@/components/po-form";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/purchase-orders/new")({
  component: NewPO,
});

function NewPO() {
  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="New Purchase Order"
        subtitle="Create a new PO"
        actions={
          <Button variant="outline" asChild>
            <Link to="/purchase-orders"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Link>
          </Button>
        }
      />
      <POForm />
    </div>
  );
}