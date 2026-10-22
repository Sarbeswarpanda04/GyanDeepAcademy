
import "@supabase/functions-js/edge-runtime.d.ts";
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ success: false, message: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("Missing Supabase environment configuration.");
      return json({
        success: false,
        message: "Login service is not configured.",
      }, 500);
    }

    const body = await req.json();
    const phone = String(body.phone ?? "").replace(/\D/g, "");
    const pin = String(body.pin ?? "");

    if (!/^\d{10}$/.test(phone) || !/^\d{4}$/.test(pin)) {
      return json({
        success: false,
        message: "Enter a valid mobile number and 4-digit PIN.",
      }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Only active teacher accounts can use this login.
    const { data: members, error: memberError } = await admin
      .from("institute_team_members")
      .select(
        "id, user_id, institute_id, role, full_name, phone, permissions, is_active",
      )
      .eq("phone", phone)
      .eq("role", "teacher")
      .eq("is_active", true)
      .limit(2);

    if (memberError) {
      console.error("Member lookup failed:", memberError.message);
      return json({
        success: false,
        message: "Unable to verify login details.",
      }, 500);
    }

    // A phone number shared by multiple institutes is ambiguous.
    if (!members || members.length !== 1) {
      return json({
        success: false,
        message: "Invalid mobile number or PIN.",
      }, 401);
    }

    const member = members[0];

    if (!member.user_id) {
      return json({
        success: false,
        message:
          "This account is not fully configured. Ask your institute owner to re-add or repair the account.",
      }, 409);
    }

    const { data: credential, error: credentialError } = await admin
      .from("institute_team_credentials")
      .select("login_pin, auth_password")
      .eq("team_member_id", member.id)
      .maybeSingle();

    if (credentialError) {
      console.error("Credential lookup failed:", credentialError.message);
      return json({
        success: false,
        message: "Unable to verify login details.",
      }, 500);
    }

    if (!credential || credential.login_pin !== pin) {
      return json({
        success: false,
        message: "Invalid mobile number or PIN.",
      }, 401);
    }

    if (!credential.auth_password) {
      return json({
        success: false,
        message:
          "This account needs to be configured for secure login. Ask your institute owner for assistance.",
      }, 409);
    }

    // Must match the internal email created by add-team-member.
    const authEmail = `member-${member.id}@login.gyandeep.invalid`;

    // Use the public client to obtain a genuine Supabase Auth session.
    const loginClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: signInError } =
      await loginClient.auth.signInWithPassword({
        email: authEmail,
        password: credential.auth_password,
      });

    if (signInError || !authData.session || !authData.user) {
      console.error(
        "Internal Auth sign-in failed:",
        signInError?.message ?? "Session was not returned.",
      );

      return json({
        success: false,
        message:
          "Unable to establish your login session. Contact your institute owner.",
      }, 500);
    }

    // Ensure the Auth account is the one linked to this team member.
    if (authData.user.id !== member.user_id) {
      await loginClient.auth.signOut();

      return json({
        success: false,
        message: "The account link is invalid. Contact your institute owner.",
      }, 500);
    }

    return json({
      success: true,
      message: "Login successful.",
      member: {
        id: member.id,
        user_id: member.user_id,
        institute_id: member.institute_id,
        role: member.role,
        full_name: member.full_name,
        phone: member.phone,
        permissions: member.permissions,
      },
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_at: authData.session.expires_at,
        expires_in: authData.session.expires_in,
        token_type: authData.session.token_type,
      },
    });
  } catch (error) {
    console.error("teacher-pin-login failed:", error);

    return json({
      success: false,
      message: "Unable to process login.",
    }, 500);
  }
});
