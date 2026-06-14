import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Brain, ChevronLeft, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useAppSettings } from "@/lib/app-settings";
import { useStore } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/ai-learning")({
  component: AILearningPage,
});

interface MappingRow {
  id: string;
  client_id: string | null;
  field: string;
  original_text: string;
  mapped_value: string;
  confirmations: number;
  enabled: boolean;
}

interface AuditRow {
  id: string;
  client_id: string | null;
  field: string;
  original_value: string | null;
  corrected_value: string | null;
  user_email: string | null;
  created_at: string;
}

function AILearningPage() {
  const { user } = useAuth();
  const { settings, setSetting } = useAppSettings();
  const clients = useStore((s) => s.clients);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [imports, setImports] = useState<number>(0);
  const [profiles, setProfiles] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== "admin") return;
    void (async () => {
      setLoading(true);
      const [m, a, i, p] = await Promise.all([
        supabase
          .from("description_mappings")
          .select("*")
          .order("confirmations", { ascending: false })
          .limit(500),
        supabase
          .from("learning_audit_log")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("pdf_imports")
          .select("id", { count: "exact", head: true })
          .eq("status", "saved"),
        supabase
          .from("client_extraction_profiles")
          .select("id", { count: "exact", head: true }),
      ]);
      setMappings((m.data ?? []) as MappingRow[]);
      setAudits((a.data ?? []) as AuditRow[]);
      setImports(i.count ?? 0);
      setProfiles(p.count ?? 0);
      setLoading(false);
    })();
  }, [user]);

  const totalCorrections = audits.length;
  const accuracy = useMemo(() => {
    // rough: high-confirmation mappings / total mappings
    if (!mappings.length) return 100;
    const high = mappings.filter((m) => m.confirmations >= 5).length;
    return Math.round((high / mappings.length) * 100);
  }, [mappings]);

  const topCorrections = useMemo(
    () => [...mappings].sort((a, b) => b.confirmations - a.confirmations).slice(0, 10),
    [mappings],
  );

  const accuracyByClient = useMemo(() => {
    const byClient = new Map<string | null, { confirmed: number; total: number }>();
    for (const m of mappings) {
      const k = m.client_id;
      const e = byClient.get(k) ?? { confirmed: 0, total: 0 };
      e.total++;
      if (m.confirmations >= 5) e.confirmed++;
      byClient.set(k, e);
    }
    return Array.from(byClient.entries()).map(([cid, v]) => ({
      client: cid ? clients.find((c) => c.id === cid)?.name ?? "—" : "Global",
      accuracy: Math.round((v.confirmed / v.total) * 100),
      total: v.total,
    }));
  }, [mappings, clients]);

  async function toggleEnabled(row: MappingRow, enabled: boolean) {
    const { error } = await supabase
      .from("description_mappings")
      .update({ enabled })
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMappings((arr) => arr.map((m) => (m.id === row.id ? { ...m, enabled } : m)));
  }

  async function deleteMapping(row: MappingRow) {
    if (!confirm("Delete this learned mapping?")) return;
    const { error } = await supabase.from("description_mappings").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMappings((arr) => arr.filter((m) => m.id !== row.id));
  }

  if (user?.role !== "admin") {
    return (
      <div className="p-6 lg:p-8 max-w-2xl">
        <PageHeader title="AI Learning Dashboard" />
        <Card>
          <CardContent className="flex items-center gap-3 p-8 text-muted-foreground">
            <ShieldAlert className="h-6 w-6 text-amber-500" />
            This dashboard is only available to administrators.
          </CardContent>
        </Card>
      </div>
    );
  }

  const confidenceLabel = (n: number) =>
    n >= 20 ? "high" : n >= 5 ? "medium" : "low";
  const confidenceClass = (n: number) =>
    n >= 20
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : n >= 5
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "bg-muted text-muted-foreground";

  return (
    <div className="p-6 lg:p-8 max-w-7xl space-y-6">
      <PageHeader
        title="AI Learning Dashboard"
        subtitle="What the AI has learned from your PDF imports"
        actions={
          <Button variant="outline" asChild>
            <Link to="/dashboard">
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "POs Saved", value: imports },
          { label: "Corrections Learned", value: totalCorrections },
          { label: "Client Profiles", value: profiles },
          { label: "Extraction Accuracy", value: `${accuracy}%` },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className="text-2xl font-semibold mt-1">{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" /> Most Common Corrections
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Original</TableHead>
                <TableHead>Mapped To</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Confirms</TableHead>
                <TableHead>Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topCorrections.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                    No corrections yet
                  </TableCell>
                </TableRow>
              ) : (
                topCorrections.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-xs">{m.field}</TableCell>
                    <TableCell>{m.original_text}</TableCell>
                    <TableCell className="font-medium">{m.mapped_value}</TableCell>
                    <TableCell>
                      {m.client_id ? clients.find((c) => c.id === m.client_id)?.name ?? "—" : "Global"}
                    </TableCell>
                    <TableCell className="text-right">{m.confirmations}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded-full ${confidenceClass(m.confirmations)}`}>
                        {confidenceLabel(m.confirmations)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accuracy by Client</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Mappings</TableHead>
                <TableHead className="text-right">Accuracy</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accuracyByClient.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                    No data yet
                  </TableCell>
                </TableRow>
              ) : (
                accuracyByClient.map((r) => (
                  <TableRow key={r.client}>
                    <TableCell>{r.client}</TableCell>
                    <TableCell className="text-right">{r.total}</TableCell>
                    <TableCell className="text-right">{r.accuracy}%</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Learned Rules</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Original</TableHead>
                <TableHead>Mapped</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Confirms</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : mappings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                    Nothing learned yet
                  </TableCell>
                </TableRow>
              ) : (
                mappings.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-xs">{m.field}</TableCell>
                    <TableCell>{m.original_text}</TableCell>
                    <TableCell className="font-medium">{m.mapped_value}</TableCell>
                    <TableCell>
                      {m.client_id ? clients.find((c) => c.id === m.client_id)?.name ?? "—" : "Global"}
                    </TableCell>
                    <TableCell className="text-right">{m.confirmations}</TableCell>
                    <TableCell>
                      <Switch checked={m.enabled} onCheckedChange={(v) => void toggleEnabled(m, v)} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => void deleteMapping(m)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Correction Audit Log</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Field</TableHead>
                <TableHead>Original</TableHead>
                <TableHead>Corrected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audits.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                    No history yet
                  </TableCell>
                </TableRow>
              ) : (
                audits.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{new Date(a.created_at).toLocaleString()}</TableCell>
                    <TableCell>{a.user_email ?? "—"}</TableCell>
                    <TableCell>
                      {a.client_id ? clients.find((c) => c.id === a.client_id)?.name ?? "—" : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{a.field}</TableCell>
                    <TableCell className="text-muted-foreground">{a.original_value}</TableCell>
                    <TableCell className="font-medium">{a.corrected_value}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}