import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Tag, Users, FileText, LogOut, Factory, Plus, List, Upload, History, ChevronDown, Truck, FileScan, Brain, ShieldCheck, Activity, CalendarDays, ClipboardList, BarChart3, Package } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useAppSettings } from "@/lib/app-settings";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/brands", label: "Brand Master", icon: Tag },
  { to: "/clients", label: "Client Master", icon: Users },
] as const;

const poNavBase: { to: string; label: string; icon: typeof Plus; exact?: boolean; pdfOnly?: boolean }[] = [
  { to: "/purchase-orders/new", label: "Add PO", icon: Plus },
  { to: "/purchase-orders", label: "PO List", icon: List, exact: true },
  { to: "/purchase-orders/import", label: "Import Excel", icon: Upload },
  { to: "/purchase-orders/import-pdf", label: "Import PDF PO", icon: FileScan, pdfOnly: true },
  { to: "/purchase-orders/pdf-import-history", label: "PDF Import History", icon: History, pdfOnly: true },
  { to: "/purchase-orders/import-history", label: "Import History", icon: History },
];

const dispatchNav: { to: string; label: string; icon: typeof Plus; exact?: boolean }[] = [
  { to: "/invoices/new", label: "Create Invoice", icon: Plus },
  { to: "/invoices", label: "Invoice List", icon: List, exact: true },
  { to: "/invoices/import", label: "Import Dispatch Excel", icon: Upload },
];

const reportsNav: { to: string; label: string; icon: typeof Plus }[] = [
  { to: "/reports/pendency-po", label: "Pendency (PO Wise)", icon: ClipboardList },
  { to: "/reports/pendency-item", label: "Pendency (Item Wise)", icon: Package },
];

const adminNav: { to: string; label: string; icon: typeof Plus }[] = [
  { to: "/admin/audit-logs", label: "Audit Logs", icon: ClipboardList },
  { to: "/admin/user-activity", label: "User Activity", icon: Activity },
  { to: "/admin/daily-report", label: "Daily Work Report", icon: CalendarDays },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, logout } = useAuth();
  const { settings } = useAppSettings();
  const navigate = useNavigate();
  const canSeePdf = user?.role === "admin" || settings.allow_user_pdf_import;
  const poNav = poNavBase.filter((i) => !i.pdfOnly || canSeePdf);
  const [poOpen, setPoOpen] = useState(true);
  const poActive = pathname === "/purchase-orders" || pathname.startsWith("/purchase-orders/");
  const [dispatchOpen, setDispatchOpen] = useState(true);
  const dispatchActive = pathname === "/invoices" || pathname.startsWith("/invoices/");
  const [reportsOpen, setReportsOpen] = useState(true);
  const reportsActive = pathname.startsWith("/reports/");
  const [adminOpen, setAdminOpen] = useState(true);
  const adminActive = pathname.startsWith("/admin/");
  const isAdmin = user?.role === "admin";

  return (
    <aside className="hidden md:flex md:w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="px-5 py-5 border-b border-sidebar-border flex items-center gap-3">
        <div className="h-9 w-9 rounded-md bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center">
          <Factory className="h-5 w-5" />
        </div>
        <div>
          <div className="font-semibold leading-tight">Shree Lace</div>
          <div className="text-xs text-sidebar-foreground/70">ERP System</div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {nav.map((item) => {
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setPoOpen((o) => !o)}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
            poActive
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          }`}
        >
          <FileText className="h-4 w-4" />
          <span className="flex-1 text-left">Purchase Orders</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${poOpen ? "" : "-rotate-90"}`} />
        </button>
        {poOpen && (
          <div className="ml-3 pl-3 border-l border-sidebar-border space-y-1">
            {poNav.map((item) => {
              const active = item.exact
                ? pathname === item.to
                : pathname === item.to || pathname.startsWith(item.to + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={() => setDispatchOpen((o) => !o)}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
            dispatchActive
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          }`}
        >
          <Truck className="h-4 w-4" />
          <span className="flex-1 text-left">Dispatch</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${dispatchOpen ? "" : "-rotate-90"}`} />
        </button>
        {dispatchOpen && (
          <div className="ml-3 pl-3 border-l border-sidebar-border space-y-1">
            {dispatchNav.map((item) => {
              const active = item.exact
                ? pathname === item.to
                : pathname === item.to || pathname.startsWith(item.to + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={() => setReportsOpen((o) => !o)}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
            reportsActive
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          <span className="flex-1 text-left">Reports</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${reportsOpen ? "" : "-rotate-90"}`} />
        </button>
        {reportsOpen && (
          <div className="ml-3 pl-3 border-l border-sidebar-border space-y-1">
            {reportsNav.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}

        <Link
          to="/ai-learning"
          className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
            pathname === "/ai-learning"
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          }`}
        >
          <Brain className="h-4 w-4" />
          AI Learning
        </Link>

        {isAdmin && (
          <>
            <button
              type="button"
              onClick={() => setAdminOpen((o) => !o)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                adminActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              <span className="flex-1 text-left">Admin</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${adminOpen ? "" : "-rotate-90"}`} />
            </button>
            {adminOpen && (
              <div className="ml-3 pl-3 border-l border-sidebar-border space-y-1">
                {adminNav.map((item) => {
                  const active = pathname === item.to || pathname.startsWith(item.to + "/");
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </nav>
      <div className="p-3 border-t border-sidebar-border">
        <div className="px-3 py-2 text-xs text-sidebar-foreground/70">
          Signed in as <span className="font-medium text-sidebar-foreground">{user?.email}</span>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={async () => {
            await logout();
            navigate({ to: "/login", replace: true });
          }}
        >
          <LogOut className="h-4 w-4 mr-2" /> Logout
        </Button>
      </div>
    </aside>
  );
}