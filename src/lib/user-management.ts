import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/permissions";

// Secondary Supabase client used only for user signup so that creating a
// new user does NOT replace the admin's session in the browser.
const SIGNUP_URL = "https://olwbjmeobxkxpgfdxsbi.supabase.co";
const SIGNUP_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sd2JqbWVvYnhreHBnZmR4c2JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTc2NjUsImV4cCI6MjA5NTg5MzY2NX0.OabcmlpQQC6uygmM2BStFf7vMvraDaw8tVl1FDw4LcQ";
const signupClient = createClient(SIGNUP_URL, SIGNUP_ANON, {
  auth: { persistSession: false, autoRefreshToken: false, storageKey: "sb-signup-transient" },
});

export interface UserRow {
  id: string;
  email: string | null;
  full_name: string;
  mobile: string | null;
  designation: string | null;
  department: string | null;
  role: AppRole;
  status: "active" | "inactive";
  last_login_at: string | null;
  created_at: string;
  created_by: string | null;
}

export async function listUsers(): Promise<UserRow[]> {
  const { data, error } = await supabase
    .from("user_management_view")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as UserRow[];
}

export interface CreateUserInput {
  email: string;
  password: string;
  full_name: string;
  mobile?: string;
  designation?: string;
  department?: string;
  role: AppRole;
  status: "active" | "inactive";
}

export async function createUser(input: CreateUserInput): Promise<string> {
  const { data, error } = await signupClient.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.full_name } },
  });
  if (error) throw error;
  const id = data.user?.id;
  if (!id) throw new Error("User was created but no id was returned. Check Supabase email-confirm settings.");

  // Trigger auto-inserts the profile + default 'viewer' role. Update to the
  // requested values (RLS lets admins write).
  const { error: pErr } = await supabase.from("user_profiles").upsert({
    id,
    full_name: input.full_name,
    mobile: input.mobile ?? null,
    designation: input.designation ?? null,
    department: input.department ?? null,
    status: input.status,
    updated_at: new Date().toISOString(),
  });
  if (pErr) throw pErr;

  await setUserRole(id, input.role);
  // Clear the transient signup session immediately.
  await signupClient.auth.signOut();
  return id;
}

export interface UpdateUserInput {
  id: string;
  full_name: string;
  mobile?: string | null;
  designation?: string | null;
  department?: string | null;
  role: AppRole;
  status: "active" | "inactive";
}

export async function updateUser(input: UpdateUserInput): Promise<void> {
  const { error } = await supabase.from("user_profiles").update({
    full_name: input.full_name,
    mobile: input.mobile ?? null,
    designation: input.designation ?? null,
    department: input.department ?? null,
    status: input.status,
    updated_at: new Date().toISOString(),
  }).eq("id", input.id);
  if (error) throw error;
  await setUserRole(input.id, input.role);
}

export async function setUserStatus(id: string, status: "active" | "inactive"): Promise<void> {
  const { error } = await supabase
    .from("user_profiles")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

async function setUserRole(userId: string, role: AppRole): Promise<void> {
  const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
  if (delErr) throw delErr;
  const { error: insErr } = await supabase.from("user_roles").insert({ user_id: userId, role });
  if (insErr) throw insErr;
}

export async function touchLastLogin(userId: string): Promise<void> {
  await supabase
    .from("user_profiles")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", userId);
}

export async function getMyProfile(userId: string): Promise<{ status: "active" | "inactive" } | null> {
  const { data } = await supabase
    .from("user_profiles")
    .select("status")
    .eq("id", userId)
    .maybeSingle();
  return (data as { status: "active" | "inactive" } | null) ?? null;
}