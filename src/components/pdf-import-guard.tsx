import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useAppSettings } from "@/lib/app-settings";

export function PdfImportGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { settings, ready } = useAppSettings();
  if (!ready) return null;
  const allowed = user?.role === "admin" || settings.allow_user_pdf_import;
  if (!allowed) {
    return (
      <div className="p-6 lg:p-8 max-w-2xl">
        <Card>
          <CardContent className="flex items-center gap-3 p-8 text-muted-foreground">
            <ShieldAlert className="h-6 w-6 text-amber-500" />
            PDF import is currently disabled. Ask an administrator to enable it for your account.
          </CardContent>
        </Card>
      </div>
    );
  }
  return <>{children}</>;
}