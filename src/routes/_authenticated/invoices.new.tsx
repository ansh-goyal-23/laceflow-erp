import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { InvoiceForm } from "@/components/invoice-form";

export const Route = createFileRoute("/_authenticated/invoices/new")({
  component: NewInvoice,
});

function NewInvoice() {
  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Create Invoice"
        subtitle="Dispatch items from one or more purchase orders"
        actions={
          <Button variant="outline" asChild>
            <Link to="/invoices"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Link>
          </Button>
        }
      />
      <InvoiceForm />
    </div>
  );
}