
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ success: false, message: "Method not allowed." }, 405);
  }

  let admin: ReturnType<typeof createClient> | null = null;
  let newlyCreatedAuthId: string | null = null;

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization");

    if (!url || !anonKey || !serviceKey || !authorization) {
      return json({ success: false, message: "Login or server configuration is missing." }, 401);
    }

    const callerClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: userError } =
      await callerClient.auth.getUser();

    if (userError || !user) {
      return json({ success: false, message: "Please sign in again." }, 401);
    }

    admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json();
    const instituteId = String(body.instituteId ?? "");
    const memberId = String(body.memberId ?? "");

    // Only an owner or manager belonging to this institute can repair it.
    if (!instituteId || !memberId) {
      return json({ success: false, message: "Institute and member IDs are required." }, 400);
    }

    const { data: memberships, error: membershipError } = await admin
      .from("institute_members")
      .select("role")
      .eq("institute_id", instituteId)
      .eq("user_id", user.id);

    if (membershipError) throw membershipError;

    const callerRole = String(memberships?.[0]?.role ?? "").toLowerCase();

    if (!memberships?.length || !["owner", "manager"].includes(callerRole)) {
      return json({ success: false, message: "You cannot repair this account." }, 403);
    }

    const { data: member, error: memberError } = await admin
      .from("institute_team_members")
      .select("id, institute_id, role, full_name, phone, staff_id, user_id, is_active")
      .eq("id", memberId)
      .eq("institute_id", instituteId)
      .maybeSingle();

    if (memberError) throw memberError;

    if (!member || member.role !== "teacher" || !member.is_active) {
      return json({ success: false, message: "Active teacher account not found." }, 404);
    }

    // Managers can repair teachers only.
    if (callerRole === "manager" && member.role !== "teacher") {
      return json({ success: false, message: "Managers can repair teacher accounts only." }, 403);
    }

    if (!member.staff_id) {
      return json({ success: false, message: "The teacher has no linked staff record. Repair the staff link first." }, 409);
    }

    const { data: staff, error: staffError } = await admin
      .from("institute_staff")
      .select("id")
      .eq("id", member.staff_id)
      .eq("institute_id", instituteId)
      .eq("status", "active")
      .maybeSingle();

    if (staffError) throw staffError;

    if (!staff) {
      return json({ success: false, message: "The linked staff record is missing or inactive." }, 409);
    }

    const authEmail = `member-${member.id}@login.gyandeep.invalid`;

    // Read existing credentials before changing anything.
    const { data: oldCredential, error: credentialLookupError } = await admin
      .from("institute_team_credentials")
      .select("team_member_id, login_pin, auth_password")
      .eq("team_member_id", member.id)
      .maybeSingle();

    if (credentialLookupError) throw credentialLookupError;

    // Never silently invent or reset the teacher's PIN.
    const suppliedPin = String(body.pin ?? "");
    const pin = oldCredential?.login_pin != null
      ? String(oldCredential.login_pin)
      : suppliedPin;

    if (!/^\d{4}$/.test(pin)) {
      return json({
        success: false,
        message: "No valid existing PIN was found. Supply a new 4-digit PIN to repair this account.",
      }, 400);
    }

    // Find the deterministic Auth identity, if it already exists.
    let authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null = null;

    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 500,
      });

      if (error) throw error;

      const found = data.users.find(
        (candidate) => candidate.email?.toLowerCase() === authEmail.toLowerCase(),
      );

      if (found) {
        authUser = found;
        break;
      }

      if (data.users.length < 500) break;
    }

    const authPassword = randomPassword();

    if (authUser) {
      // Refuse to link an identity that belongs to another team member.
      const metadataMemberId = authUser.user_metadata?.team_member_id;

      if (metadataMemberId !== member.id) {
        return json({
          success: false,
          message: "The existing Auth identity cannot be safely verified. Contact support.",
        }, 409);
      }

      const { data, error } = await admin.auth.admin.updateUserById(
        authUser.id,
        { password: authPassword },
      );

      if (error || !data.user) throw error ?? new Error("Unable to repair Auth password.");

      authUser = data.user;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: authEmail,
        password: authPassword,
        email_confirm: true,
        user_metadata: {
          team_member_id: member.id,
          institute_id: instituteId,
          team_role: member.role,
        },
      });

      if (error || !data.user) throw error ?? new Error("Unable to create Auth identity.");

      authUser = data.user;
      newlyCreatedAuthId = data.user.id;
    }

    // Keep the existing PIN; repair the internal password.
    const { error: credentialWriteError } = await admin
      .from("institute_team_credentials")
      .upsert({
        team_member_id: member.id,
        login_pin: pin,
        auth_password: authPassword,
      }, { onConflict: "team_member_id" });

    if (credentialWriteError) throw credentialWriteError;

    const { error: linkError } = await admin
      .from("institute_team_members")
      .update({ user_id: authUser.id })
      .eq("id", member.id)
      .eq("institute_id", instituteId);

    if (linkError) throw linkError;

    return json({
      success: true,
      message: "Teacher account repaired. The existing PIN has been preserved.",
      memberId: member.id,
    });
  } catch (error) {
    console.error("[repair-team-member]", error);

    // Remove a newly created Auth user if provisioning failed.
    // Never delete an Auth identity that existed before this request.
    if (admin && newlyCreatedAuthId) {
      const { error: cleanupError } =
        await admin.auth.admin.deleteUser(newlyCreatedAuthId);

      if (cleanupError) {
        console.error("[repair-team-member] Auth cleanup failed:", cleanupError.message);
      }
    }

    return json({
      success: false,
      message: "Unable to repair the account. Check the Edge Function logs.",
    }, 500);
  }
});
