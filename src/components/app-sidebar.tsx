import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Tag, Users, FileText, LogOut, Factory } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/brands", label: "Brand Master", icon: Tag },
  { to: "/clients", label: "Client Master", icon: Users },
  { to: "/purchase-orders", label: "Purchase Orders", icon: FileText },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
      </nav>
      <div className="p-3 border-t border-sidebar-border">
        <div className="px-3 py-2 text-xs text-sidebar-foreground/70">
          Signed in as <span className="font-medium text-sidebar-foreground">{user?.username}</span>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => {
            logout();
            navigate({ to: "/login", replace: true });
          }}
        >
          <LogOut className="h-4 w-4 mr-2" /> Logout
        </Button>
      </div>
    </aside>
  );
}