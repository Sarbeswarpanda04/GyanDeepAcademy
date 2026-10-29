
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

 let admin: ReturnType<typeof createClient<any>> | null = null;
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

   const callerClient = createClient<any>(supabaseUrl, anonKey, {
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

    admin = createClient<any>(supabaseUrl, serviceRoleKey, {
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


    // 1. Block duplicate phone numbers belonging to active team members.
    const { data: activeDuplicate, error: activeDuplicateError } = await admin
      .from("institute_team_members")
      .select("id")
      .eq("institute_id", instituteId)
      .eq("phone", phone)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (activeDuplicateError) throw activeDuplicateError;

    if (activeDuplicate) {
      return response({
        success: false,
        message: "This mobile number is already registered to an active team member.",
      }, 409);
    }

    // 2. Look for a previously deactivated membership with this phone.
    const { data: inactiveMember, error: inactiveError } = await admin
      .from("institute_team_members")
      .select("id, role, staff_id, user_id")
      .eq("institute_id", instituteId)
      .eq("phone", phone)
      .eq("is_active", false)
      .limit(1)
      .maybeSingle();

    if (inactiveError) throw inactiveError;

    if (inactiveMember) {
      // Only reuse the old record for the same role and, for teachers,
      // the same staff record. Do not transfer an old account accidentally.
      const sameTeacher =
  role === "teacher" &&
  inactiveMember.role === "teacher" &&
  (
    inactiveMember.staff_id === staffId ||
    inactiveMember.staff_id === null
  );

      const sameNonTeacherRole =
        role !== "teacher" &&
        inactiveMember.role === role;

      if (!sameTeacher && !sameNonTeacherRole) {
        return response({
          success: false,
          message:
            "This phone number belongs to a previously deactivated team member. Please check the old membership before reusing it.",
        }, 409);
      }

      // Reactivate the old membership, preserving its ID and Auth identity.
      const { data: reactivatedMember, error: reactivateError } = await admin
        .from("institute_team_members")
        .update({
          full_name: fullName,
          phone,
          role,
          staff_id: role === "teacher" ? staffId : null,
          permissions: cleanPermissions,
          is_active: true,
        })
        .eq("id", inactiveMember.id)
        .eq("institute_id", instituteId)
        .eq("is_active", false)
        .select(
          "id, institute_id, full_name, phone, role, permissions, is_active, user_id"
        )
        .maybeSingle();

      if (reactivateError) throw reactivateError;

      if (!reactivatedMember) {
        return response({
          success: false,
          message:
            "The previous membership could not be reactivated. Refresh the team list and try again.",
        }, 409);
      }

      // Update the existing PIN record rather than inserting a duplicate.
      const { data: existingCredential, error: credentialLookupError } =
        await admin
          .from("institute_team_credentials")
          .select("team_member_id")
          .eq("team_member_id", inactiveMember.id)
          .maybeSingle();

      if (credentialLookupError) {
        // Roll back the reactivation if credential lookup fails.
        await admin
          .from("institute_team_members")
          .update({ is_active: false })
          .eq("id", inactiveMember.id);

        throw credentialLookupError;
      }

      if (existingCredential) {
        const { error: credentialUpdateError } = await admin
          .from("institute_team_credentials")
          .update({ login_pin: pin })
          .eq("team_member_id", inactiveMember.id);

        if (credentialUpdateError) {
          await admin
            .from("institute_team_members")
            .update({ is_active: false })
            .eq("id", inactiveMember.id);

          throw credentialUpdateError;
        }
      } else {
        // No credential row exists; create one without creating another Auth user.
        const { error: credentialInsertError } = await admin
          .from("institute_team_credentials")
          .insert({
            team_member_id: inactiveMember.id,
            login_pin: pin,
          });

        if (credentialInsertError) {
          await admin
            .from("institute_team_members")
            .update({ is_active: false })
            .eq("id", inactiveMember.id);

          throw credentialInsertError;
        }
      }

      return response({
        success: true,
        message: "Previous team membership reactivated successfully.",
        member: reactivatedMember,
      });
    }

    // 3. No previous inactive membership: create a new membership.
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
          message:
            "This mobile number conflicts with an existing team record. Check the database uniqueness constraints.",
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
