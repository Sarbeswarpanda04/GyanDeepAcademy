import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return reply({ success: false, error: "Method not allowed." }, 405);
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !anonKey || !serviceKey) {
      return reply({ success: false, error: "Server configuration is incomplete." }, 500);
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return reply({ success: false, error: "Sign in first." }, 401);
    }

    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: authError } = await caller.auth.getUser();

    if (authError || !user) {
      return reply({ success: false, error: "Session expired." }, 401);
    }

    const body = await req.json();

    const token = String(body.expoPushToken ?? "").trim();
    const instituteId = String(body.instituteId ?? "").trim();
    const deviceName = String(body.deviceName ?? "").slice(0, 120);

    if (!instituteId) {
      return reply({ success: false, error: "Institute ID is required." }, 400);
    }

    if (
      !token.startsWith("ExponentPushToken[") &&
      !token.startsWith("ExpoPushToken[")
    ) {
      return reply({ success: false, error: "Invalid Expo push token." }, 400);
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Identify the teacher within the currently selected institute.
    const { data: member, error: memberError } = await admin
      .from("institute_team_members")
      .select("id,institute_id,role,is_active")
      .eq("user_id", user.id)
      .eq("institute_id", instituteId)
      .eq("is_active", true)
      .maybeSingle();

    if (memberError) {
      console.error("[register-teacher-push-token] Membership lookup:", memberError);
      throw memberError;
    }

    if (!member || String(member.role).toLowerCase() !== "teacher") {
      return reply({
        success: false,
        error: "No active teacher membership found for this institute.",
      }, 403);
    }

    const { error: saveError } = await admin
      .from("teacher_push_tokens")
      .upsert(
        {
          institute_id: member.institute_id,
          team_member_id: member.id,
          expo_push_token: token,
          device_name: deviceName || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "expo_push_token" },
      );

    if (saveError) {
      console.error("[register-teacher-push-token] Save error:", saveError);
      throw saveError;
    }

    console.log("[register-teacher-push-token] Token registered:", {
      userId: user.id,
      instituteId: member.institute_id,
      teamMemberId: member.id,
    });

    return reply({
      success: true,
      message: "Teacher device registered successfully.",
      teamMemberId: member.id,
      instituteId: member.institute_id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("[register-teacher-push-token]", message);

    return reply({
      success: false,
      error: message,
    }, 500);
  }
});