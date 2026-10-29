import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return reply({ success: false, error: "Method not allowed." }, 405);
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !anonKey || !serviceKey) {
      console.error("[send-notice] Missing required Supabase environment variables.");
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

    const {
      data: { user },
      error: authError,
    } = await caller.auth.getUser();

    if (authError || !user) {
      console.warn("[send-notice] Caller authentication failed:", authError?.message);
      return reply({ success: false, error: "Session expired. Please sign in again." }, 401);
    }

    let body: { noticeId?: unknown };
    try {
      body = await req.json();
    } catch {
      return reply({ success: false, error: "Request body must be valid JSON." }, 400);
    }

    const noticeId = body?.noticeId;
    if (typeof noticeId !== "string" || !noticeId.trim()) {
      return reply({ success: false, error: "noticeId is required." }, 400);
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: notice, error: noticeError } = await admin
      .from("institute_notices")
      .select("id,institute_id,title,body,category,priority,attachment_path,status,created_by")
      .eq("id", noticeId)
      .maybeSingle();

    if (noticeError) {
      console.error("[send-notice] Notice lookup failed:", noticeError.message);
      throw new Error(`Notice lookup failed: ${noticeError.message}`);
    }
    if (!notice) {
      return reply({ success: false, error: "Notice not found." }, 404);
    }

    const [
      { data: instituteMembership, error: imError },
      { data: teamMembership, error: tmError },
    ] = await Promise.all([
      admin
        .from("institute_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("institute_id", notice.institute_id)
        .maybeSingle(),
      admin
        .from("institute_team_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("institute_id", notice.institute_id)
        .eq("is_active", true)
        .maybeSingle(),
    ]);

    if (imError) {
      console.error("[send-notice] Institute membership lookup failed:", imError.message);
      throw new Error(`Institute membership lookup failed: ${imError.message}`);
    }
    if (tmError) {
      console.error("[send-notice] Team membership lookup failed:", tmError.message);
      throw new Error(`Team membership lookup failed: ${tmError.message}`);
    }

    const role = String(instituteMembership?.role ?? teamMembership?.role ?? "").toLowerCase();
    if (!["owner", "manager"].includes(role)) {
      return reply({ success: false, error: "Only an owner or manager can send notices." }, 403);
    }

    const { data: recipients, error: recipientError } = await admin
      .from("institute_notice_recipients")
      .select("team_member_id")
      .eq("notice_id", notice.id)
      .eq("institute_id", notice.institute_id);

    if (recipientError) {
      console.error("[send-notice] Recipient lookup failed:", recipientError.message);
      throw new Error(`Recipient lookup failed: ${recipientError.message}`);
    }
    if (!recipients?.length) {
      return reply({ success: false, error: "Select at least one recipient before sending." }, 400);
    }

    const recipientIds = [...new Set(recipients.map((r) => r.team_member_id).filter(Boolean))];
    if (!recipientIds.length) {
      return reply({ success: false, error: "No valid recipients were selected." }, 400);
    }

    const { data: activeTeachers, error: teachersError } = await admin
      .from("institute_team_members")
      .select("id")
      .in("id", recipientIds)
      .eq("institute_id", notice.institute_id)
      .eq("role", "teacher")
      .eq("is_active", true);

    if (teachersError) {
      console.error("[send-notice] Active teacher lookup failed:", teachersError.message);
      throw new Error(`Active teacher lookup failed: ${teachersError.message}`);
    }

    const activeIds = (activeTeachers ?? []).map((t) => t.id);
    if (!activeIds.length) {
      return reply({ success: false, error: "None of the selected recipients are active teachers." }, 400);
    }

    const { data: devices, error: deviceError } = await admin
      .from("teacher_push_tokens")
      .select("team_member_id,expo_push_token")
      .eq("institute_id", notice.institute_id)
      .in("team_member_id", activeIds);

    if (deviceError) {
      console.error("[send-notice] Push token lookup failed:", deviceError.message);
      throw new Error(`Push token lookup failed: ${deviceError.message}`);
    }

    // Ignore blank tokens and deduplicate by token to avoid duplicate pushes.
    const uniqueDevices = [
      ...new Map(
        (devices ?? [])
          .filter((d) => typeof d.expo_push_token === "string" && d.expo_push_token.trim())
          .map((d) => [d.expo_push_token, d]),
      ).values(),
    ];

    let attachmentUrl: string | null = null;
    if (notice.attachment_path) {
      const { data: signed, error: signedError } = await admin.storage
        .from("notice-attachments")
        .createSignedUrl(notice.attachment_path, 60 * 60 * 24 * 3);

      if (signedError) {
        // An attachment should not prevent sending the text notice.
        console.warn("[send-notice] Could not create attachment URL:", signedError.message);
      } else {
        attachmentUrl = signed?.signedUrl ?? null;
      }
    }

    if (!uniqueDevices.length) {
      return reply({
        success: false,
        error: "No selected teachers have registered push-enabled devices yet. The notice was saved but no push was sent.",
        code: "NO_PUSH_TOKENS",
      }, 409);
    }

    let accepted = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < uniqueDevices.length; i += 100) {
      const batch = uniqueDevices.slice(i, i + 100);
      const payload = batch.map((device) => ({
        to: device.expo_push_token,
        title: notice.title,
        body: String(notice.body ?? "").slice(0, 240),
        sound: "default",
        channelId: "default",
        priority: notice.priority === "urgent" || notice.priority === "high" ? "high" : "default",
        ...(attachmentUrl ? { richContent: { image: attachmentUrl } } : {}),
        data: {
          type: "institute_notice",
          noticeId: notice.id,
          instituteId: notice.institute_id,
          ...(attachmentUrl ? { imageUrl: attachmentUrl } : {}),
        },
      }));

      let pushResponse: Response;
      let result: any;
      try {
        pushResponse = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        result = await pushResponse.json();
      } catch (pushError) {
        console.error("[send-notice] Expo Push API network/JSON error:", pushError);
        throw new Error("Could not contact Expo Push API or parse its response.");
      }

      if (!pushResponse.ok) {
        console.error("[send-notice] Expo Push API HTTP error:", pushResponse.status, result);
        throw new Error(`Expo Push API returned HTTP ${pushResponse.status}.`);
      }

      const tickets = Array.isArray(result?.data) ? result.data : [];
      if (tickets.length !== batch.length) {
        console.error("[send-notice] Unexpected Expo ticket count:", {
          expected: batch.length,
          received: tickets.length,
          response: result,
        });
      }

      for (let j = 0; j < batch.length; j++) {
        const device = batch[j];
        const ticket = tickets[j];
        const ok = ticket?.status === "ok";
        const message = ok
          ? null
          : String(ticket?.message ?? "Expo did not return a successful push ticket.");

        if (ok) accepted++;
        else {
          failed++;
          errors.push(message ?? "Push ticket failed.");
        }

        const { error: logError } = await admin.from("notice_delivery_logs").insert({
          notice_id: notice.id,
          institute_id: notice.institute_id,
          team_member_id: device.team_member_id,
          expo_push_token: device.expo_push_token,
          status: ok ? "accepted" : "failed",
          expo_ticket_id: ticket?.id ?? null,
          error_message: message,
          attempt_count: 1,
          sent_at: new Date().toISOString(),
        });

        if (logError) {
          // Logging failure should not hide the result of a push already submitted.
          console.error("[send-notice] Could not write delivery log:", logError.message);
        }
      }
    }

    const { error: publishError } = await admin
      .from("institute_notices")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", notice.id);

    if (publishError) {
      console.error("[send-notice] Pushes processed but publishing status update failed:", publishError.message);
      throw new Error(`Pushes processed, but notice status update failed: ${publishError.message}`);
    }

    return reply({
      success: true,
      accepted,
      failed,
      attempted: uniqueDevices.length,
      message: failed
        ? "Notice published. Some push requests were rejected by Expo; check delivery logs."
        : "Push requests processed. Acceptance by Expo does not guarantee device delivery.",
      ...(errors.length ? { errors: [...new Set(errors)].slice(0, 5) } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[send-notice] Unhandled error:", message, error);
    // Return a useful, sanitized error to the authenticated caller while retaining
    // full diagnostic details in Supabase Edge Function logs.
    return reply({
      success: false,
      error: message || "Unable to send notice.",
    }, 500);
  }
});
