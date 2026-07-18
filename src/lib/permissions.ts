// Role-based permission matrix for UI-level gating.
// Kept data-driven so new roles (Procurement / Store / Production / Accounts /
// Dispatch, etc.) can be added later without changing call sites.

export type AppRole = "admin" | "editor" | "viewer" | "user";

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
  | "user_management";

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
};

const viewer: RoleMatrix = {
  dashboard: READ_ONLY, brands: READ_ONLY, clients: READ_ONLY,
  purchase_orders: READ_ONLY, dispatch: READ_ONLY, reports: READ_ONLY,
  yarn: READ_ONLY, ai_learning: READ_ONLY,
  admin: NONE, user_management: NONE,
};

const MATRIX: Record<AppRole, RoleMatrix> = {
  admin,
  editor,
  viewer,
  user: viewer, // legacy "user" role behaves like viewer
};

export function can(role: AppRole | undefined, module: ModuleKey, action: PermissionAction): boolean {
  if (!role) return false;
  return Boolean(MATRIX[role]?.[module]?.[action]);
}

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
  user: "User",
};

export const ASSIGNABLE_ROLES: AppRole[] = ["admin", "editor", "viewer"];