// Supabase Edge Function: get-team-member-credentials
// Deploy as: supabase/functions/get-team-member-credentials/index.ts
// Returns login PINs only to an authenticated owner/manager of the requested institute.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Server environment is not configured" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authentication required" }, 401);

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) return json({ error: "Invalid session" }, 401);

    const body = await req.json();
    const instituteId = body?.institute_id;
    const memberIds = body?.member_ids;

    if (
      typeof instituteId !== "string" ||
      !Array.isArray(memberIds) ||
      memberIds.length > 200 ||
      memberIds.some((id: unknown) => typeof id !== "string")
    ) {
      return json({ error: "Invalid request" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: memberships, error: membershipError } = await admin
      .from("institute_members")
      .select("role")
      .eq("institute_id", instituteId)
      .eq("user_id", user.id)
      .limit(1);

    if (membershipError) throw membershipError;
    const role = String(memberships?.[0]?.role ?? "").toLowerCase();
    if (!["owner", "manager"].includes(role)) {
      return json({ error: "You are not authorized to view these credentials" }, 403);
    }

    if (memberIds.length === 0) return json({ credentials: [] });

    // Confirm every requested member belongs to this institute and is active.
    const { data: validMembers, error: memberError } = await admin
      .from("institute_team_members")
      .select("id")
      .eq("institute_id", instituteId)
      .eq("is_active", true)
      .in("id", memberIds);

    if (memberError) throw memberError;
    const validIds = (validMembers ?? []).map((row: { id: string }) => row.id);
    if (validIds.length === 0) return json({ credentials: [] });

    const { data: credentials, error: credentialsError } = await admin
      .from("institute_team_credentials")
      .select("team_member_id,login_pin")
      .in("team_member_id", validIds);

    if (credentialsError) throw credentialsError;

    return json({
      credentials: (credentials ?? []).map((row: { team_member_id: string; login_pin: string }) => ({
        team_member_id: row.team_member_id,
        login_pin: row.login_pin,
      })),
    });
  } catch (error) {
    console.error("get-team-member-credentials error:", error);
    return json({ error: "Unable to load member credentials" }, 500);
  }
});
