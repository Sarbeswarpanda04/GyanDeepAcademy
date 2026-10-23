import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Required Supabase environment variables are missing.");
    return jsonResponse({ error: "Server configuration error." }, 500);
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Authentication required." }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // This service-role client must remain server-side only.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ error: "Invalid or expired session." }, 401);
    }

    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return jsonResponse({ error: "Invalid request body." }, 400);
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Request body must be valid JSON." }, 400);
    }

    const instituteId =
      typeof body.instituteId === "string" ? body.instituteId.trim() : "";
    const memberId =
      typeof body.memberId === "string" ? body.memberId.trim() : "";
    const fullName =
      typeof body.fullName === "string" ? body.fullName.trim() : "";
    const phone =
      typeof body.phone === "string" ? body.phone.replace(/\D/g, "").slice(-10) : "";
    const staffId =
      typeof body.staffId === "string" && body.staffId.trim()
        ? body.staffId.trim()
        : null;
    const permissions = body.permissions;
    const pin = body.pin;

    if (!instituteId || !memberId) {
      return jsonResponse({
        error: "Institute ID and team member ID are required.",
      }, 400);
    }

    if (!fullName) {
      return jsonResponse({ error: "Full name is required." }, 400);
    }

    if (!/^\d{10}$/.test(phone)) {
      return jsonResponse({
        error: "Enter a valid 10-digit mobile number.",
      }, 400);
    }

    if (
      permissions === null ||
      typeof permissions !== "object" ||
      Array.isArray(permissions)
    ) {
      return jsonResponse({ error: "Invalid permissions format." }, 400);
    }

    // A missing or empty PIN means keep the current PIN.
    const changePin = typeof pin === "string" && pin.length > 0;
    if (changePin && !/^\d{4}$/.test(pin as string)) {
      return jsonResponse({
        error: "The PIN must contain exactly 4 digits.",
      }, 400);
    }

    // Verify caller's membership and permissions for this institute.
    const { data: callerMembership, error: membershipError } = await admin
      .from("institute_members")
      .select("id, institute_id, user_id, role")
      .eq("institute_id", instituteId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      console.error("Membership lookup failed:", membershipError.message);
      return jsonResponse({
        error: "Unable to verify institute permissions.",
      }, 500);
    }

    const callerRole = String(callerMembership?.role ?? "").toLowerCase();
    if (!callerMembership || !["owner", "manager"].includes(callerRole)) {
      return jsonResponse({
        error: "You are not authorized to edit team members.",
      }, 403);
    }

    // Confirm the target is active and belongs to this institute.
    const { data: member, error: memberError } = await admin
      .from("institute_team_members")
      .select("id, institute_id, role, staff_id, user_id, is_active")
      .eq("id", memberId)
      .eq("institute_id", instituteId)
      .eq("is_active", true)
      .maybeSingle();

    if (memberError) {
      console.error("Member lookup failed:", memberError.message);
      return jsonResponse({ error: "Unable to load the team member." }, 500);
    }

    if (!member) {
      return jsonResponse({
        error: "Active team member not found in this institute.",
      }, 404);
    }

    const memberRole = String(member.role ?? "").toLowerCase();
    if (callerRole === "manager" && memberRole !== "teacher") {
      return jsonResponse({
        error: "Managers can edit teachers only.",
      }, 403);
    }

    // Teacher records must reference a staff row in the same institute.
    // Do not query institute_staff.is_active: that column does not exist.
    let verifiedStaffId: string | null = null;

    if (memberRole === "teacher") {
      if (!staffId) {
        return jsonResponse({
          error: "Select a staff member for this teacher.",
        }, 400);
      }

      const { data: staff, error: staffError } = await admin
        .from("institute_staff")
        .select("id, institute_id, phone")
        .eq("id", staffId)
        .eq("institute_id", instituteId)
        .maybeSingle();

      if (staffError) {
        console.error("Staff lookup failed:", staffError.message);
        return jsonResponse({
          error: "Unable to verify the selected staff member.",
        }, 500);
      }

      if (!staff) {
        return jsonResponse({
          error: "Selected staff member does not exist in this institute.",
        }, 400);
      }

      const staffPhone = String(staff.phone ?? "")
        .replace(/\D/g, "")
        .slice(-10);

      if (!staffPhone || staffPhone !== phone) {
        return jsonResponse({
          error: "Mobile number must match the selected staff record.",
        }, 400);
      }

      verifiedStaffId = String(staff.id);
    }

    // Update the team member without allowing the role or institute to change.
    const { data: updatedMember, error: updateError } = await admin
      .from("institute_team_members")
      .update({
        full_name: fullName,
        phone,
        staff_id: verifiedStaffId,
        permissions,
        updated_at: new Date().toISOString(),
      })
      .eq("id", memberId)
      .eq("institute_id", instituteId)
      .eq("is_active", true)
      .select("id, full_name, phone, role, permissions")
      .maybeSingle();

    if (updateError) {
      console.error("Team member update failed:", updateError.message);
      return jsonResponse({ error: "Failed to update the team member." }, 500);
    }

    if (!updatedMember) {
      return jsonResponse({
        error: "No active team member was updated. Refresh and try again.",
      }, 404);
    }

    // Change only the PIN. Do not alter the internal Auth password.
    if (changePin) {
      const { data: credential, error: credentialLookupError } = await admin
        .from("institute_team_credentials")
        .select("team_member_id")
        .eq("team_member_id", memberId)
        .maybeSingle();

      if (credentialLookupError) {
        console.error(
          "Credential lookup failed:",
          credentialLookupError.message,
        );
        return jsonResponse({
          error:
            "Member details were updated, but PIN credentials could not be verified.",
        }, 500);
      }

      if (!credential) {
        return jsonResponse({
          error:
            "Member details were updated, but no PIN credential row exists for this member.",
        }, 500);
      }

      const { error: pinUpdateError } = await admin
        .from("institute_team_credentials")
        .update({ login_pin: pin as string })
        .eq("team_member_id", memberId);

      if (pinUpdateError) {
        console.error("PIN update failed:", pinUpdateError.message);
        return jsonResponse({
          error:
            "Member details were updated, but the PIN could not be changed.",
        }, 500);
      }
    }

    return jsonResponse({
      success: true,
      message: "Team member updated successfully.",
      member: updatedMember,
    });
  } catch (error) {
    console.error(
      "Unexpected update-team-member error:",
      error instanceof Error ? error.stack ?? error.message : error,
    );
    return jsonResponse({ error: "An unexpected server error occurred." }, 500);
  }
});
