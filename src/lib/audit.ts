import { supabase } from "@/integrations/supabase/client";

export type AuditAction = "CREATE" | "EDIT" | "DELETE" | "IMPORT" | "LOGIN" | "LOGOUT";

export interface AuditLogRow {
  id: number;
  created_at: string;
  user_id: string | null;
  user_name: string;
  module: string;
  action: AuditAction;
  record_type: string | null;
  record_id: string | null;
}

/** Fire-and-forget activity log. Never throws — failures are logged to console. */
export async function logActivity(
  module: string,
  action: AuditAction,
  recordType?: string | null,
  recordId?: string | number | null,
): Promise<void> {
  try {
    const { error } = await supabase.rpc("log_activity", {
      _module: module,
      _action: action,
      _record_type: recordType ?? null,
      _record_id: recordId == null ? null : String(recordId),
    });
    if (error) console.warn("[audit] log_activity failed:", error.message);
  } catch (e) {
    console.warn("[audit] log_activity threw:", e);
  }
}

export interface AuditFilters {
  search?: string;
  userId?: string | null;
  module?: string | null;
  action?: AuditAction | null;
  from?: string | null; // ISO date (yyyy-mm-dd)
  to?: string | null;
  limit?: number;
  offset?: number;
}

export async function fetchAuditLogs(
  f: AuditFilters = {},
): Promise<{ rows: AuditLogRow[]; total: number }> {
  let q = supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (f.userId) q = q.eq("user_id", f.userId);
  if (f.module) q = q.eq("module", f.module);
  if (f.action) q = q.eq("action", f.action);
  if (f.from) q = q.gte("created_at", new Date(f.from + "T00:00:00").toISOString());
  if (f.to) q = q.lte("created_at", new Date(f.to + "T23:59:59.999").toISOString());
  if (f.search) {
    const s = f.search.replace(/[%_]/g, "");
    q = q.or(
      `user_name.ilike.%${s}%,module.ilike.%${s}%,record_type.ilike.%${s}%,record_id.ilike.%${s}%`,
    );
  }
  const limit = f.limit ?? 50;
  const offset = f.offset ?? 0;
  q = q.range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as AuditLogRow[], total: count ?? 0 };
}

export async function fetchAuditUsers(): Promise<{ user_id: string; user_name: string }[]> {
  const { data, error } = await supabase.rpc("audit_known_users");
  if (error) throw error;
  return (data ?? []) as { user_id: string; user_name: string }[];
}

/** Loads all rows in range (admin-only, expected small). */
async function loadRange(from: string, to: string, userId?: string | null): Promise<AuditLogRow[]> {
  const all: AuditLogRow[] = [];
  let offset = 0;
  const page = 1000;
  for (;;) {
    let q = supabase
      .from("audit_logs")
      .select("*")
      .gte("created_at", new Date(from + "T00:00:00").toISOString())
      .lte("created_at", new Date(to + "T23:59:59.999").toISOString())
      .order("created_at", { ascending: false })
      .range(offset, offset + page - 1);
    if (userId) q = q.eq("user_id", userId);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as AuditLogRow[];
    all.push(...rows);
    if (rows.length < page) break;
    offset += page;
  }
  return all;
}

export interface UserActivityRow {
  user_id: string | null;
  user_name: string;
  created: number;
  edited: number;
  deleted: number;
  imports: number;
  logins: number;
  last_activity: string | null;
}

export async function fetchUserActivity(
  from: string,
  to: string,
  userId?: string | null,
): Promise<UserActivityRow[]> {
  const rows = await loadRange(from, to, userId);
  const map = new Map<string, UserActivityRow>();
  for (const r of rows) {
    const key = r.user_id ?? `name:${r.user_name}`;
    let m = map.get(key);
    if (!m) {
      m = {
        user_id: r.user_id,
        user_name: r.user_name,
        created: 0,
        edited: 0,
        deleted: 0,
        imports: 0,
        logins: 0,
        last_activity: r.created_at,
      };
      map.set(key, m);
    }
    if (r.action === "CREATE") m.created++;
    else if (r.action === "EDIT") m.edited++;
    else if (r.action === "DELETE") m.deleted++;
    else if (r.action === "IMPORT") m.imports++;
    else if (r.action === "LOGIN") m.logins++;
    if (!m.last_activity || r.created_at > m.last_activity) m.last_activity = r.created_at;
  }
  return Array.from(map.values()).sort((a, b) =>
    (b.last_activity ?? "").localeCompare(a.last_activity ?? ""),
  );
}

export interface DailyReportUser {
  user_id: string | null;
  user_name: string;
  total: number;
  // module -> action -> count
  breakdown: Record<string, Partial<Record<AuditAction, number>>>;
}

export async function fetchDailyReport(date: string): Promise<DailyReportUser[]> {
  const rows = await loadRange(date, date);
  const map = new Map<string, DailyReportUser>();
  for (const r of rows) {
    const key = r.user_id ?? `name:${r.user_name}`;
    let u = map.get(key);
    if (!u) {
      u = { user_id: r.user_id, user_name: r.user_name, total: 0, breakdown: {} };
      map.set(key, u);
    }
    u.total++;
    const mod = (u.breakdown[r.module] ??= {});
    mod[r.action] = (mod[r.action] ?? 0) + 1;
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}