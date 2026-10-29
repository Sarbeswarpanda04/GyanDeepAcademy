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
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")
    return reply({ error: "Method not allowed." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = req.headers.get("Authorization");
    if (!authorization) return reply({ error: "Sign in first." }, 401);
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: authError,
    } = await caller.auth.getUser();
    if (authError || !user) return reply({ error: "Session expired." }, 401);
    const body = await req.json();
    const token = String(body.expoPushToken ?? "");
    const deviceName = String(body.deviceName ?? "").slice(0, 120);
    if (
      !token.startsWith("ExponentPushToken[") &&
      !token.startsWith("ExpoPushToken[")
    )
      return reply({ error: "Invalid Expo push token." }, 400);
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: member, error: memberError } = await admin
      .from("institute_team_members")
      .select("id,institute_id,role,is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (memberError) throw memberError;
    if (!member || String(member.role).toLowerCase() !== "teacher")
      return reply({ error: "An active teacher account is required." }, 403);
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
    if (saveError) throw saveError;
    return reply({ success: true });
  } catch (error) {
  const message =
    error instanceof Error ? error.message : String(error);

  console.error("[register-teacher-push-token]", message);

  return reply(
    { error: message },
    500,
  );
}
});
