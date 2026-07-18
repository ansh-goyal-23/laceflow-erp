import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Pencil, Ban, CheckCircle2, ArrowUpDown } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { AdminGuard } from "@/components/admin-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  createUser, listUsers, setUserStatus, updateUser, type UserRow,
} from "@/lib/user-management";
import { ASSIGNABLE_ROLES, ROLE_LABEL, type AppRole } from "@/lib/permissions";
import { logActivity } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: () => (
    <AdminGuard>
      <UsersPage />
    </AdminGuard>
  ),
});

type SortKey = keyof UserRow;

function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [roleF, setRoleF] = useState<string>("all");
  const [deptF, setDeptF] = useState<string>("all");
  const [statusF, setStatusF] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await listUsers());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const departments = useMemo(
    () => Array.from(new Set(rows.map((r) => r.department).filter(Boolean))) as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (roleF !== "all" && r.role !== roleF) return false;
      if (statusF !== "all" && r.status !== statusF) return false;
      if (deptF !== "all" && (r.department ?? "") !== deptF) return false;
      if (!s) return true;
      return [r.full_name, r.email, r.mobile, r.designation, r.department, r.role]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(s));
    });
  }, [rows, search, roleF, statusF, deptF]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const va = (a[sortKey] ?? "") as string;
      const vb = (b[sortKey] ?? "") as string;
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const SortHead = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <TableHead>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {children}
        <ArrowUpDown className={`h-3 w-3 ${sortKey === k ? "text-foreground" : "text-muted-foreground/60"}`} />
      </button>
    </TableHead>
  );

  async function onToggleStatus(u: UserRow) {
    const next = u.status === "active" ? "inactive" : "active";
    try {
      await setUserStatus(u.id, next);
      await logActivity("User Management", "EDIT", "User", u.email ?? u.id);
      toast.success(`${u.full_name || u.email} is now ${next}`);
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="User Management"
        subtitle="Manage users, roles, and access permissions."
        actions={
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Add User
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, email, mobile…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={roleF} onValueChange={setRoleF}>
            <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {ASSIGNABLE_ROLES.map((r) => (
                <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusF} onValueChange={setStatusF}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          {departments.length > 0 && (
            <Select value={deptF} onValueChange={setDeptF}>
              <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead k="full_name">Name</SortHead>
                  <SortHead k="email">Email</SortHead>
                  <SortHead k="mobile">Mobile</SortHead>
                  <SortHead k="designation">Designation</SortHead>
                  <SortHead k="department">Department</SortHead>
                  <SortHead k="role">Role</SortHead>
                  <SortHead k="status">Status</SortHead>
                  <SortHead k="last_login_at">Last Login</SortHead>
                  <SortHead k="created_at">Created On</SortHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={10} className="text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
                )}
                {!loading && sorted.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center text-sm text-muted-foreground">No users match these filters.</TableCell></TableRow>
                )}
                {!loading && sorted.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                    <TableCell>{u.email || "—"}</TableCell>
                    <TableCell>{u.mobile || "—"}</TableCell>
                    <TableCell>{u.designation || "—"}</TableCell>
                    <TableCell>{u.department || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                        {ROLE_LABEL[u.role] ?? u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.status === "active" ? "default" : "outline"}
                        className={u.status === "active" ? "bg-emerald-600 hover:bg-emerald-600" : "text-muted-foreground"}>
                        {u.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(u.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button variant="ghost" size="icon" title="Edit"
                          onClick={() => { setEditing(u); setDialogOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon"
                          title={u.status === "active" ? "Disable" : "Enable"}
                          onClick={() => onToggleStatus(u)}>
                          {u.status === "active"
                            ? <Ban className="h-4 w-4 text-destructive" />
                            : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            {sorted.length} of {rows.length} users
          </div>
        </CardContent>
      </Card>

      <UserDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={() => { setDialogOpen(false); void load(); }}
      />
    </div>
  );
}

function UserDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: UserRow | null;
  onSaved: () => void;
}) {
  const isEdit = !!editing;
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<AppRole>("editor");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFullName(editing?.full_name ?? "");
      setEmail(editing?.email ?? "");
      setMobile(editing?.mobile ?? "");
      setDesignation(editing?.designation ?? "");
      setDepartment(editing?.department ?? "");
      setPassword("");
      setConfirm("");
      setRole((editing?.role as AppRole) ?? "editor");
      setStatus(editing?.status ?? "active");
    }
  }, [open, editing]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return toast.error("Full name is required");
    if (!email.trim()) return toast.error("Email is required");
    if (!isEdit) {
      if (!password || password.length < 8) return toast.error("Password must be at least 8 characters");
      if (password !== confirm) return toast.error("Passwords do not match");
    }
    setSaving(true);
    try {
      if (isEdit && editing) {
        await updateUser({
          id: editing.id,
          full_name: fullName.trim(),
          mobile: mobile.trim() || null,
          designation: designation.trim() || null,
          department: department.trim() || null,
          role, status,
        });
        await logActivity("User Management", "EDIT", "User", email);
        toast.success("User updated");
      } else {
        await createUser({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          mobile: mobile.trim() || undefined,
          designation: designation.trim() || undefined,
          department: department.trim() || undefined,
          role, status,
        });
        await logActivity("User Management", "CREATE", "User", email);
        toast.success("User created. If email confirmation is enabled in Supabase, ask them to confirm before signing in.");
      }
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit User" : "Add User"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update profile, role, and status."
              : "Create a new user account with role and initial password."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5 md:col-span-2">
            <Label>Full Name *</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Email *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              required disabled={isEdit} autoComplete="off" />
            {isEdit && <p className="text-xs text-muted-foreground">Email cannot be changed after creation.</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Mobile</Label>
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Designation</Label>
            <Input value={designation} onChange={(e) => setDesignation(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Role *</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASSIGNABLE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as "active" | "inactive")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!isEdit && (
            <>
              <div className="space-y-1.5">
                <Label>Password *</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password" required minLength={8} />
              </div>
              <div className="space-y-1.5">
                <Label>Confirm Password *</Label>
                <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password" required minLength={8} />
              </div>
            </>
          )}
          <DialogFooter className="md:col-span-2 mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create User"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}