import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://olwbjmeobxkxpgfdxsbi.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sd2JqbWVvYnhreHBnZmR4c2JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTc2NjUsImV4cCI6MjA5NTg5MzY2NX0.OabcmlpQQC6uygmM2BStFf7vMvraDaw8tVl1FDw4LcQ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});