import { createFileRoute } from "@tanstack/react-router";
import { AdminGuard } from "@/components/admin-guard";
import { TooltipProvider } from "@/components/ui/tooltip";
import SalaryGeneration from "@/pages/SalaryGeneration";

export const Route = createFileRoute("/_authenticated/admin/salary-generation")({
  head: () => ({ meta: [{ title: "Salary Generation | Shree Lace ERP" }] }),
  component: () => (
    <AdminGuard>
      <TooltipProvider>
        <SalaryGeneration />
      </TooltipProvider>
    </AdminGuard>
  ),
});
