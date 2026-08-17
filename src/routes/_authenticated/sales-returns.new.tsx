import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { SalesReturnForm } from "@/components/sales-return-form";

export const Route = createFileRoute("/_authenticated/sales-returns/new")({
  component: NewSalesReturn,
});

function NewSalesReturn() {
  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Create Sales Return"
        subtitle="Record materials returned by a client (debit note / return challan)"
        actions={
          <Button variant="outline" asChild>
            <Link to="/sales-returns"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Link>
          </Button>
        }
      />
      <SalesReturnForm />
    </div>
  );
}
