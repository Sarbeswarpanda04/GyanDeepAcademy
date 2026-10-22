
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return response({ success: false, message: "Method not allowed." }, 405);
  }

  let admin: ReturnType<typeof createClient> | null = null;
  let createdMemberId: string | null = null;
  let createdAuthUserId: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Supabase server configuration is incomplete.");
    }

    if (!authorization) {
      return response({ success: false, message: "Please sign in first." }, 401);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: authError,
    } = await callerClient.auth.getUser();

    if (authError || !user) {
      return response({ success: false, message: "Your session has expired." }, 401);
    }

    admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json();

    const instituteId = String(body.instituteId ?? "");
    const role = String(body.role ?? "").toLowerCase();
    const fullName = String(body.fullName ?? "").trim();
    const phone = String(body.phone ?? "").replace(/\D/g, "");
    const pin = String(body.pin ?? "");
    const staffId = body.staffId ? String(body.staffId) : null;
    const permissions = body.permissions;

    if (!instituteId || !fullName) {
      return response({
        success: false,
        message: "Institute and member name are required.",
      }, 400);
    }

    if (!["owner", "manager", "teacher"].includes(role)) {
      return response({ success: false, message: "Invalid role." }, 400);
    }

    if (!/^\d{10}$/.test(phone)) {
      return response({
        success: false,
        message: "Enter a valid 10-digit mobile number.",
      }, 400);
    }

    if (!/^\d{4}$/.test(pin)) {
      return response({
        success: false,
        message: "PIN must contain exactly 4 digits.",
      }, 400);
    }

    if (!permissions || typeof permissions !== "object" ||
        Array.isArray(permissions)) {
      return response({ success: false, message: "Invalid permissions." }, 400);
    }

    const allowedPermissions = [
      "attendance", "students", "fees", "exams",
      "notices", "reports", "materials",
    ];

    const cleanPermissions: Record<string, boolean> = {};

    for (const key of allowedPermissions) {
      if (typeof permissions[key] !== "boolean") {
        return response({
          success: false,
          message: `Invalid permission: ${key}.`,
        }, 400);
      }
      cleanPermissions[key] = permissions[key];
    }

    const { data: memberships, error: membershipError } = await admin
      .from("institute_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("institute_id", instituteId);

    if (membershipError) throw membershipError;

    const callerRole = String(memberships?.[0]?.role ?? "").toLowerCase();

    if (!memberships?.length || !["owner", "manager"].includes(callerRole)) {
      return response({
        success: false,
        message: "You cannot add members to this institute.",
      }, 403);
    }

    if (callerRole === "manager" && role !== "teacher") {
      return response({
        success: false,
        message: "Managers can add teachers only.",
      }, 403);
    }

    if (role === "teacher") {
      if (!staffId) {
        return response({
          success: false,
          message: "Select an existing teacher from Staff.",
        }, 400);
      }

      const { data: staffRecord, error: staffError } = await admin
        .from("institute_staff")
        .select("id, full_name, phone, staff_type, status")
        .eq("id", staffId)
        .eq("institute_id", instituteId)
        .eq("status", "active")
        .maybeSingle();

      if (staffError) throw staffError;

      if (!staffRecord) {
        return response({
          success: false,
          message: "The selected staff member is unavailable.",
        }, 400);
      }

      const staffType = String(staffRecord.staff_type ?? "").toLowerCase();

      if (staffType && !staffType.includes("teacher")) {
        return response({
          success: false,
          message: "Select a teacher staff record.",
        }, 400);
      }

      const staffPhone = String(staffRecord.phone ?? "")
        .replace(/\D/g, "")
        .slice(-10);

      if (staffPhone && staffPhone !== phone) {
        return response({
          success: false,
          message: "Use the mobile number registered for this teacher in Staff.",
        }, 400);
      }
    }

    const { data: existing, error: duplicateError } = await admin
      .from("institute_team_members")
      .select("id")
      .eq("institute_id", instituteId)
      .eq("phone", phone)
      .maybeSingle();

    if (duplicateError) throw duplicateError;

    if (existing) {
      return response({
        success: false,
        message: "This mobile number is already registered in the team.",
      }, 409);
    }

    const { data: member, error: insertError } = await admin
      .from("institute_team_members")
      .insert({
        institute_id: instituteId,
        role,
        full_name: fullName,
        phone,
        staff_id: role === "teacher" ? staffId : null,
        permissions: cleanPermissions,
        created_by: user.id,
        is_active: true,
      })
      .select("id, institute_id, full_name, phone, role, permissions, is_active")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return response({
          success: false,
          message: "This mobile number is already registered in the team.",
        }, 409);
      }
      throw insertError;
    }

    createdMemberId = member.id;

    // Create an internal Auth identity. The teacher never needs this password.
    const authEmail = `member-${member.id}@login.gyandeep.invalid`;
    const authPassword = randomPassword();

    const { data: authResult, error: createAuthError } =
      await admin.auth.admin.createUser({
        email: authEmail,
        password: authPassword,
        email_confirm: true,
        user_metadata: {
          team_member_id: member.id,
          institute_id: instituteId,
          team_role: role,
        },
      });

    if (createAuthError || !authResult.user) {
      throw createAuthError ?? new Error("Could not create Auth identity.");
    }

    createdAuthUserId = authResult.user.id;

    const { error: linkError } = await admin
      .from("institute_team_members")
      .update({ user_id: createdAuthUserId })
      .eq("id", member.id);

    if (linkError) throw linkError;

    // Store the PIN and internal Auth password only in the restricted table.
    const { error: credentialError } = await admin
      .from("institute_team_credentials")
      .insert({
        team_member_id: member.id,
        login_pin: pin,
        auth_password: authPassword,
      });

    if (credentialError) throw credentialError;

    return response({
      success: true,
      message: "Team member added successfully.",
      member: {
        ...member,
        user_id: createdAuthUserId,
      },
    });
  } catch (error) {
    console.error("[add-team-member]", error);

    // Best-effort cleanup so failed provisioning doesn't leave an active member.
    if (admin && createdMemberId) {
      await admin
        .from("institute_team_credentials")
        .delete()
        .eq("team_member_id", createdMemberId);

      if (createdAuthUserId) {
        const { error: deleteAuthError } =
          await admin.auth.admin.deleteUser(createdAuthUserId);
        if (deleteAuthError) {
          console.error("[add-team-member] Auth cleanup failed", deleteAuthError);
        }
      }

      await admin
        .from("institute_team_members")
        .delete()
        .eq("id", createdMemberId);
    }

    return response({
      success: false,
      message: "Unable to add team member. Check the Edge Function logs.",
    }, 500);
  }
});
