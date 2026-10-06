// Role-based permission matrix for UI-level gating.
// Kept data-driven so new roles (Procurement / Store / Production / Accounts /
// Dispatch, etc.) can be added later without changing call sites.

export type AppRole = "admin" | "accounts" | "editor" | "viewer" | "user";

export type ModuleKey =
  | "dashboard"
  | "brands"
  | "clients"
  | "purchase_orders"
  | "dispatch"
  | "reports"
  | "yarn"
  | "ai_learning"
  | "admin"
  | "user_management"
  | "salary_generation";

export type PermissionAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "export"
  | "print"
  | "import";

type ModulePerms = Partial<Record<PermissionAction, boolean>>;
type RoleMatrix = Record<ModuleKey, ModulePerms>;

const ALL: ModulePerms = {
  view: true, create: true, edit: true, delete: true,
  approve: true, export: true, print: true, import: true,
};
const READ_ONLY: ModulePerms = { view: true, export: true, print: true };
const NONE: ModulePerms = {};

const admin: RoleMatrix = {
  dashboard: ALL, brands: ALL, clients: ALL, purchase_orders: ALL,
  dispatch: ALL, reports: ALL, yarn: ALL, ai_learning: ALL,
  admin: ALL, user_management: ALL,
  salary_generation: ALL,
};

const editor: RoleMatrix = {
  dashboard: { view: true },
  brands: { view: true, create: true, edit: true, export: true, print: true },
  clients: { view: true, create: true, edit: true, export: true, print: true },
  purchase_orders: { view: true, create: true, edit: true, import: true, export: true, print: true },
  dispatch: { view: true, create: true, edit: true, import: true, export: true, print: true },
  reports: { view: true, export: true, print: true },
  yarn: { view: true, create: true, edit: true, import: true, export: true, print: true },
  ai_learning: { view: true },
  admin: NONE,
  user_management: NONE,
  salary_generation: NONE,
};

const viewer: RoleMatrix = {
  dashboard: READ_ONLY, brands: READ_ONLY, clients: READ_ONLY,
  purchase_orders: READ_ONLY, dispatch: READ_ONLY, reports: READ_ONLY,
  yarn: READ_ONLY, ai_learning: READ_ONLY,
  admin: NONE, user_management: NONE,
  salary_generation: NONE,
};

const accounts: RoleMatrix = {
  dashboard: NONE, brands: NONE, clients: NONE, purchase_orders: NONE,
  dispatch: NONE, reports: NONE, yarn: NONE, ai_learning: NONE,
  admin: NONE, user_management: NONE,
  salary_generation: { view: true, edit: true, export: true, print: true },
};

const MATRIX: Record<AppRole, RoleMatrix> = {
  admin,
  accounts,
  editor,
  viewer,
  user: viewer, // legacy "user" role behaves like viewer
};

export function can(role: AppRole | undefined, module: ModuleKey, action: PermissionAction): boolean {
  if (!role) return false;
  return Boolean(MATRIX[role]?.[module]?.[action]);
}

/**
 * Row-level check for edit/delete actions.
 * - Admin: can modify any row.
 * - Editor: can modify only rows they created (ownerId === userId).
 * - Viewer/user: cannot modify.
 */
export function canModifyRow(
  role: AppRole | undefined,
  currentUserId: string | undefined,
  ownerId: string | null | undefined,
): boolean {
  if (!role || !currentUserId) return false;
  if (role === "admin") return true;
  if (role === "editor") return !!ownerId && ownerId === currentUserId;
  return false;
}

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  editor: "Editor",
  accounts: "Accounts",
  viewer: "Viewer",
  user: "User",
};

export const ASSIGNABLE_ROLES: AppRole[] = ["admin", "accounts", "editor", "viewer"];