import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Tag, Users, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const brands = useStore((s) => s.brands);
  const clients = useStore((s) => s.clients);
  const pos = useStore((s) => s.purchaseOrders);

  const stats = [
    { label: "Brands", value: brands.length, icon: Tag, to: "/brands" as const },
    { label: "Clients", value: clients.length, icon: Users, to: "/clients" as const },
    { label: "Purchase Orders", value: pos.length, icon: FileText, to: "/purchase-orders" as const },
    { label: "Drafts", value: pos.filter((p) => p.status === "draft").length, icon: FileText, to: "/purchase-orders" as const },
  ];

  const recent = [...pos].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Dashboard"
        subtitle="Overview of Shree Lace Industries operations"
        actions={
          <Button asChild>
            <Link to="/purchase-orders/new"><Plus className="h-4 w-4 mr-1" /> New PO</Link>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.to}>
            <Card className="hover:border-primary/60 hover:shadow-md transition">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <s.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{s.value}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent Purchase Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No purchase orders yet.</p>
          ) : (
            <ul className="divide-y">
              {recent.map((p) => {
                const brand = brands.find((b) => b.id === p.brandId);
                const client = clients.find((c) => c.id === p.clientId);
                return (
                  <li key={p.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{p.poNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        {brand?.name ?? "—"} · {client?.name ?? "—"}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${p.status === "draft" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                      {p.status}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}