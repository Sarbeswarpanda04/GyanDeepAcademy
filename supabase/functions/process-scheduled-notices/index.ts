import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-cron-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
type Job = { id: string; notice_id: string; institute_id: string; schedule_type: "once" | "recurring"; timezone: string; scheduled_at: string | null; recurrence: "daily" | "weekly" | "weekdays" | "monthly" | null; starts_at: string | null; ends_at: string | null; due_at: string };

function nextOccurrence(job: Job): string | null {
  const due = new Date(job.due_at);
  if (!job.recurrence) return null;
  if (job.recurrence === "daily") due.setUTCDate(due.getUTCDate() + 1);
  else if (job.recurrence === "weekly") due.setUTCDate(due.getUTCDate() + 7);
  else if (job.recurrence === "weekdays") {
    do { due.setUTCDate(due.getUTCDate() + 1); } while ([0, 6].includes(due.getUTCDay()));
  } else if (job.recurrence === "monthly") {
    const day = due.getUTCDate();
    due.setUTCDate(1); due.setUTCMonth(due.getUTCMonth() + 1);
    const last = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0)).getUTCDate();
    due.setUTCDate(Math.min(day, last));
  }
  if (job.ends_at && due.getTime() > new Date(job.ends_at).getTime()) return null;
  return due.toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);
  const expectedSecret = Deno.env.get("NOTICE_CRON_SECRET");
  if (!expectedSecret || req.headers.get("x-cron-secret") !== expectedSecret) return reply({ error: "Unauthorized scheduler request." }, 401);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: jobs, error: claimError } = await admin.rpc("claim_due_notice_schedules", { p_limit: 25 });
    if (claimError) throw claimError;
    let processed = 0, failed = 0;
    for (const job of (jobs ?? []) as Job[]) {
      try {
        const { data: notice, error: noticeError } = await admin.from("institute_notices").select("id,institute_id,title,body,priority,status").eq("id", job.notice_id).eq("institute_id", job.institute_id).maybeSingle();
        if (noticeError) throw noticeError;
        if (!notice || ["archived", "paused"].includes(notice.status)) {
          await admin.from("notice_schedules").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", job.id);
          continue;
        }
        const { data: recipientRows, error: recipientError } = await admin.from("institute_notice_recipients").select("team_member_id").eq("notice_id", job.notice_id).eq("institute_id", job.institute_id);
        if (recipientError) throw recipientError;
        const ids = [...new Set((recipientRows ?? []).map((r) => r.team_member_id as string))];
        const { data: teachers, error: teacherError } = await admin.from("institute_team_members").select("id").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).eq("institute_id", job.institute_id).eq("role", "teacher").eq("is_active", true);
        if (teacherError) throw teacherError;
        const activeIds = (teachers ?? []).map((t) => t.id);
        const { data: devices, error: deviceError } = await admin.from("teacher_push_tokens").select("team_member_id,expo_push_token").eq("institute_id", job.institute_id).in("team_member_id", activeIds.length ? activeIds : ["00000000-0000-0000-0000-000000000000"]);
        if (deviceError) throw deviceError;
        const dueAt = job.due_at;
        let attachmentUrl: string | null = null;
        const { data: noticeWithAttachment, error: attachmentLookupError } = await admin.from("institute_notices").select("attachment_path").eq("id", job.notice_id).maybeSingle();
        if (attachmentLookupError) throw attachmentLookupError;
        if (noticeWithAttachment?.attachment_path) {
          const { data: signed, error: signedError } = await admin.storage.from("notice-attachments").createSignedUrl(noticeWithAttachment.attachment_path, 60 * 60 * 24 * 3);
          if (!signedError) attachmentUrl = signed?.signedUrl ?? null;
        }
        const uniqueDevices = [...new Map((devices ?? []).map((d) => [d.expo_push_token, d])).values()];
        if (uniqueDevices.length) {
          for (let i = 0; i < uniqueDevices.length; i += 100) {
            const batch = uniqueDevices.slice(i, i + 100);
            const payload = batch.map((d) => ({ to: d.expo_push_token, title: notice.title, body: notice.body.slice(0, 240), sound: "default", channelId: "default", priority: notice.priority === "urgent" || notice.priority === "high" ? "high" : "default", ...(attachmentUrl ? { richContent: { image: attachmentUrl } } : {}), data: { type: "institute_notice", noticeId: notice.id, instituteId: notice.institute_id, ...(attachmentUrl ? { imageUrl: attachmentUrl } : {}) } }));
            const response = await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { Accept: "application/json", "Accept-encoding": "gzip, deflate", "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const result = await response.json();
            if (!response.ok) throw new Error("Expo Push API request failed.");
            for (let j = 0; j < (result.data ?? []).length; j++) {
              const ticket = result.data[j], device = batch[j], ok = ticket.status === "ok";
              await admin.from("notice_delivery_logs").upsert({ notice_id: notice.id, institute_id: notice.institute_id, team_member_id: device.team_member_id, expo_push_token: device.expo_push_token, status: ok ? "accepted" : "failed", expo_ticket_id: ticket.id ?? null, error_message: ok ? null : String(ticket.message ?? "Push request failed"), attempt_count: 1, scheduled_for: dueAt, sent_at: new Date().toISOString() }, { onConflict: "notice_id,team_member_id,scheduled_for" });
            }
          }
        }
        if (job.schedule_type === "once") {
          await admin.from("notice_schedules").update({ is_active: false, last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
          await admin.from("institute_notices").update({ status: "published", published_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.notice_id);
        } else {
          const next = nextOccurrence(job);
          if (!next) {
            await admin.from("notice_schedules").update({ is_active: false, last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
          } else {
            await admin.from("notice_schedules").update({ next_run_at: next, last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
          }
          await admin.from("institute_notices").update({ status: "published", published_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.notice_id);
        }
        processed++;
      } catch (e) {
        failed++;
        console.error("[process-scheduled-notices] Job failed", job.id, e);
        // Keep the job eligible for a retry in 15 minutes rather than silently losing it.
        await admin.from("notice_schedules").update({ next_run_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
      }
    }
    return reply({ success: true, claimed: (jobs ?? []).length, processed, failed });
  } catch (error) {
    console.error("[process-scheduled-notices]", error);
    return reply({ error: "Scheduled notification processing failed." }, 500);
  }
});
