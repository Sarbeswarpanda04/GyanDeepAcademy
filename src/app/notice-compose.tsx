import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

const C = {
  bg: "#F3F3FF",
  purple: "#611CD0",
  text: "#1F2937",
  muted: "#718096",
  border: "#E8E3F5",
  white: "#FFFFFF",
  lavender: "#C4B5FD",
  red: "#B91C1C",
};
type Teacher = {
  id: string;
  full_name: string;
  phone: string | null;
  role: string;
};
type DeliveryMode = "now" | "once" | "recurring";
type Category =
  | "general"
  | "attendance"
  | "exam"
  | "meeting"
  | "holiday"
  | "urgent"
  | "fees"
  | "timetable";

const CATEGORIES: { label: string; value: Category }[] = [
  { label: "General", value: "general" },
  { label: "Attendance", value: "attendance" },
  { label: "Exam / Test", value: "exam" },
  { label: "Meeting", value: "meeting" },
  { label: "Holiday", value: "holiday" },
  { label: "Urgent", value: "urgent" },
  { label: "Fees", value: "fees" },
  { label: "Timetable", value: "timetable" },
];

function localDateTimeIso(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    return null;
  const value = new Date(`${date}T${time}:00+05:30`);
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString();
}

export default function NoticeComposeScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ noticeId?: string }>();
  const noticeId = String(params.noticeId ?? "");
  const editing = Boolean(noticeId);
  const [instituteId, setInstituteId] = useState("");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allTeachers, setAllTeachers] = useState(true);
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<Category>("general");
  const [priority, setPriority] = useState<
    "low" | "normal" | "high" | "urgent"
  >("normal");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("now");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("08:00");
  const [recurrence, setRecurrence] = useState<
    "daily" | "weekly" | "weekdays" | "monthly"
  >("daily");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState("");
  const [attachmentUri, setAttachmentUri] = useState<string | null>(null);
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null);
  const [attachmentMime, setAttachmentMime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const filteredTeachers = useMemo(
    () =>
      teachers.filter((t) =>
        `${t.full_name} ${t.phone ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [teachers, search],
  );
  const recipientsCount = allTeachers ? teachers.length : selectedIds.length;

  const initialize = useCallback(async () => {
    setError("");
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        router.replace("/login" as never);
        return;
      }
      const { data: memberships, error: membershipError } = await supabase
        .from("institute_members")
        .select("institute_id,role")
        .eq("user_id", user.id)
        .limit(2);
      if (membershipError) throw membershipError;
      if (!memberships?.length)
        throw new Error("No institute is linked to this account.");
      if (memberships.length > 1)
        throw new Error("Select an institute before creating a notice.");
      const id = memberships[0].institute_id as string;
      setInstituteId(id);
      const { data: team, error: teamError } = await supabase
        .from("institute_team_members")
        .select("id,full_name,phone,role")
        .eq("institute_id", id)
        .eq("role", "teacher")
        .eq("is_active", true)
        .order("full_name");
      if (teamError) throw teamError;
      setTeachers((team ?? []) as Teacher[]);

      if (noticeId) {
        const { data: notice, error: noticeError } = await supabase
          .from("institute_notices")
          .select(
            "id,title,body,category,priority,status,delivery_mode,attachment_path,attachment_mime_type",
          )
          .eq("id", noticeId)
          .eq("institute_id", id)
          .maybeSingle();
        if (noticeError) throw noticeError;
        if (!notice) throw new Error("Notice not found or access denied.");
        setTitle(notice.title ?? "");
        setBody(notice.body ?? "");
        setCategory(notice.category ?? "general");
        setPriority(notice.priority ?? "normal");
        setDeliveryMode(
          notice.delivery_mode === "once" ||
            notice.delivery_mode === "recurring"
            ? notice.delivery_mode
            : "now",
        );
        setAttachmentPath(notice.attachment_path ?? null);
        setAttachmentMime(notice.attachment_mime_type ?? null);
        const { data: recipients, error: recipientsError } = await supabase
          .from("institute_notice_recipients")
          .select("team_member_id")
          .eq("notice_id", noticeId);
        if (recipientsError) throw recipientsError;
        const ids = (recipients ?? []).map((r) => r.team_member_id as string);
        setSelectedIds(ids);
        setAllTeachers(ids.length === 0 || ids.length === (team ?? []).length);
        const { data: schedule, error: scheduleError } = await supabase
          .from("notice_schedules")
          .select(
            "schedule_type,scheduled_at,recurrence,starts_at,ends_at,next_run_at",
          )
          .eq("notice_id", noticeId)
          .maybeSingle();
        if (scheduleError) throw scheduleError;
        if (schedule?.scheduled_at) {
          const dt = new Date(schedule.scheduled_at);
          setScheduledDate(
            `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`,
          );
          setScheduledTime(
            `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`,
          );
        }
        if (schedule?.recurrence) setRecurrence(schedule.recurrence);
        if (schedule?.starts_at)
          setStartDate(String(schedule.starts_at).slice(0, 10));
        if (schedule?.ends_at)
          setEndDate(String(schedule.ends_at).slice(0, 10));
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to prepare notice form.",
      );
    } finally {
      setLoading(false);
    }
  }, [noticeId]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Allow photo-library access to attach an image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) {
      setError("Choose an image smaller than 8 MB.");
      return;
    }
    if (
      !asset.mimeType ||
      !["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType)
    ) {
      setError("Use a JPG, PNG or WebP image.");
      return;
    }
    setAttachmentUri(asset.uri);
    setAttachmentMime(asset.mimeType);
    setError("");
  };

  const toggleTeacher = (id: string) => {
    setAllTeachers(false);
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  };

  const uploadAttachment = async (currentInstituteId: string) => {
    if (!attachmentUri) return attachmentPath;
    const response = await fetch(attachmentUri);
    const arrayBuffer = await response.arrayBuffer();
    const ext =
      attachmentMime === "image/png"
        ? "png"
        : attachmentMime === "image/webp"
          ? "webp"
          : "jpg";
    const path = `${currentInstituteId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("notice-attachments")
      .upload(path, arrayBuffer, {
        contentType: attachmentMime ?? "image/jpeg",
        upsert: false,
      });
    if (uploadError) throw uploadError;
    return path;
  };

  const saveNotice = async (action: "draft" | "send" | "schedule") => {
    setError("");
    if (!title.trim()) {
      setError("Enter a notice title.");
      return;
    }
    if (!body.trim()) {
      setError("Write the notice message.");
      return;
    }
    if (!teachers.length) {
      setError("No active teachers are available in this institute.");
      return;
    }
    if (!allTeachers && !selectedIds.length) {
      setError("Select at least one teacher, or choose all teachers.");
      return;
    }
    if (
      action === "schedule" &&
      deliveryMode === "once" &&
      !localDateTimeIso(scheduledDate, scheduledTime)
    ) {
      setError("Enter a valid schedule date and time.");
      return;
    }
    if (
      action === "schedule" &&
      deliveryMode === "recurring" &&
      !localDateTimeIso(startDate, scheduledTime)
    ) {
      setError("Enter a valid recurrence start date and time.");
      return;
    }
    if (action === "schedule" && deliveryMode === "now") {
      setError("Choose Schedule once or Automatic recurring first.");
      return;
    }
    setSaving(true);
    let newAttachmentPath: string | null = null;
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error("Your session expired. Please sign in again.");
      newAttachmentPath = await uploadAttachment(instituteId);
      const status =
        action === "draft"
          ? "draft"
          : action === "schedule"
            ? "scheduled"
            : "published";
      const mode = action === "schedule" ? deliveryMode : "now";
      const payload = {
        institute_id: instituteId,
        created_by: user.id,
        title: title.trim(),
        body: body.trim(),
        category,
        priority,
        attachment_path: newAttachmentPath,
        attachment_mime_type: attachmentMime,
        status,
        delivery_mode: mode,
        published_at: action === "send" ? new Date().toISOString() : null,
      };
      let savedId = noticeId;
      if (editing) {
        const { data, error: updateError } = await supabase
          .from("institute_notices")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", noticeId)
          .eq("institute_id", instituteId)
          .select("id")
          .single();
        if (updateError) throw updateError;
        savedId = data.id;
        await supabase
          .from("institute_notice_recipients")
          .delete()
          .eq("notice_id", savedId);
        await supabase
          .from("notice_schedules")
          .delete()
          .eq("notice_id", savedId);
      } else {
        const { data, error: insertError } = await supabase
          .from("institute_notices")
          .insert(payload)
          .select("id")
          .single();
        if (insertError) throw insertError;
        savedId = data.id;
      }
      const recipientIds = allTeachers
        ? teachers.map((t) => t.id)
        : selectedIds;
      const { error: recipientsError } = await supabase
        .from("institute_notice_recipients")
        .insert(
          recipientIds.map((team_member_id) => ({
            notice_id: savedId,
            institute_id: instituteId,
            team_member_id,
          })),
        );
      if (recipientsError) throw recipientsError;

      if (action === "schedule") {
        const scheduleAt = localDateTimeIso(scheduledDate, scheduledTime);
        const startsAt = localDateTimeIso(startDate, scheduledTime);
        const nextRunAt = deliveryMode === "once" ? scheduleAt : startsAt;
        const { error: scheduleError } = await supabase
          .from("notice_schedules")
          .insert({
            notice_id: savedId,
            institute_id: instituteId,
            schedule_type: deliveryMode === "once" ? "once" : "recurring",
            timezone: "Asia/Kolkata",
            scheduled_at: deliveryMode === "once" ? scheduleAt : null,
            recurrence: deliveryMode === "recurring" ? recurrence : null,
            starts_at: deliveryMode === "recurring" ? startsAt : null,
            ends_at:
              deliveryMode === "recurring" && endDate
                ? localDateTimeIso(endDate, "23:59")
                : null,
            next_run_at: nextRunAt,
            is_active: true,
          });
        if (scheduleError) throw scheduleError;
      }

      if (action === "send") {
        const { data: sendData, error: sendError } =
          await supabase.functions.invoke("send-notice", {
            body: { noticeId: savedId },
          });
        if (sendError) {
          // Include the Edge Function's HTTP status and response body so the
          // actual server-side failure is visible in the form error message.
          const context = (sendError as { context?: Response }).context;
          let detail = sendError.message;
          if (context) {
            try {
              const responseBody = await context.clone().text();
              detail = `send-notice failed (HTTP ${context.status})${responseBody ? `: ${responseBody}` : `: ${detail}`}`;
            } catch {
              detail = `send-notice failed (HTTP ${context.status}): ${detail}`;
            }
          }
          throw new Error(detail);
        }
        if (!sendData?.success)
          throw new Error(
            sendData?.error ?? "Notice saved, but sending was not confirmed.",
          );
      }
      router.replace("/notices" as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the notice.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#44109D" />
      <LinearGradient
        colors={["#611CD0", "#44109D", "#4C02F7"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: Math.max(insets.top, 12) + 9 }]}
      >
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Feather name="arrow-left" size={22} color={C.white} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>NOTICE CENTER</Text>
          <Text style={styles.heroTitle}>
            {editing ? "Edit notice" : "Create notice"}
          </Text>
          <Text style={styles.heroSub}>
            Make every announcement clear and timely.
          </Text>
        </View>
      </LinearGradient>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={C.purple} />
          <Text style={styles.muted}>Preparing your form…</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: Math.max(insets.bottom, 16) + 30 },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {error ? (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={18} color={C.red} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            <Section
              title="Recipients"
              subtitle="Choose who should receive this notice"
              icon="users"
            >
              <Pressable
                onPress={() => {
                  setAllTeachers(true);
                  setSelectedIds([]);
                }}
                style={styles.allRow}
              >
                <View
                  style={[
                    styles.checkbox,
                    allTeachers && styles.checkboxActive,
                  ]}
                >
                  {allTeachers ? (
                    <Feather name="check" size={14} color={C.white} />
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>All active teachers</Text>
                  <Text style={styles.rowSub}>
                    {teachers.length} teacher{teachers.length === 1 ? "" : "s"}{" "}
                    in this institute
                  </Text>
                </View>
                <Switch
                  value={allTeachers}
                  onValueChange={(value) => {
                    setAllTeachers(value);
                    if (value) setSelectedIds([]);
                  }}
                  trackColor={{ false: "#D8D3E6", true: "#C4B5FD" }}
                  thumbColor={allTeachers ? C.purple : "#FFFFFF"}
                />
              </Pressable>
              <Pressable
                onPress={() => {
                  setAllTeachers(false);
                  setSearchOpen((v) => !v);
                }}
                style={styles.outlineButton}
              >
                <Feather name="user-plus" size={17} color={C.purple} />
                <Text style={styles.outlineText}>
                  {searchOpen
                    ? "Hide teacher list"
                    : `Select individual teachers${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
                </Text>
                <Feather
                  name={searchOpen ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={C.purple}
                />
              </Pressable>
              {searchOpen && (
                <>
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search teacher name or phone"
                    placeholderTextColor="#9CA3AF"
                    style={styles.searchInput}
                  />
                  {filteredTeachers.map((teacher) => {
                    const selected = selectedIds.includes(teacher.id);
                    return (
                      <Pressable
                        key={teacher.id}
                        onPress={() => toggleTeacher(teacher.id)}
                        style={styles.teacherRow}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            selected && styles.checkboxActive,
                          ]}
                        >
                          {selected ? (
                            <Feather name="check" size={14} color={C.white} />
                          ) : null}
                        </View>
                        <View style={styles.avatar}>
                          <Text style={styles.avatarText}>
                            {teacher.full_name
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((p) => p[0])
                              .join("")
                              .toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle}>
                            {teacher.full_name}
                          </Text>
                          <Text style={styles.rowSub}>
                            {teacher.phone ?? "No phone saved"}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </>
              )}
              <Text style={styles.helper}>
                {recipientsCount} recipient{recipientsCount === 1 ? "" : "s"}{" "}
                selected
              </Text>
            </Section>

            <Section
              title="Notice content"
              subtitle="Write a clear, useful announcement"
              icon="file-text"
            >
              <FieldLabel>Title *</FieldLabel>
              <TextInput
                value={title}
                onChangeText={setTitle}
                maxLength={120}
                placeholder="e.g. Staff meeting tomorrow"
                placeholderTextColor="#9CA3AF"
                style={styles.input}
              />
              <View style={styles.counterRow}>
                <Text style={styles.fieldHint}>
                  Keep it short and specific.
                </Text>
                <Text style={styles.counter}>{title.length}/120</Text>
              </View>
              <FieldLabel>Message *</FieldLabel>
              <TextInput
                value={body}
                onChangeText={setBody}
                multiline
                textAlignVertical="top"
                maxLength={5000}
                placeholder="Write the full notice details here…"
                placeholderTextColor="#9CA3AF"
                style={[styles.input, styles.messageInput]}
              />
              <Text style={styles.counter}>{body.length}/5000</Text>
              <FieldLabel>Category</FieldLabel>
              <View style={styles.chipWrap}>
                {CATEGORIES.map((item) => (
                  <Pressable
                    key={item.value}
                    onPress={() => setCategory(item.value)}
                    style={[
                      styles.chip,
                      category === item.value && styles.chipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        category === item.value && styles.chipTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <FieldLabel>Priority</FieldLabel>
              <View style={styles.segmentRow}>
                {(["low", "normal", "high", "urgent"] as const).map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => setPriority(item)}
                    style={[
                      styles.segment,
                      priority === item && styles.segmentActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        priority === item && styles.segmentTextActive,
                      ]}
                    >
                      {item[0].toUpperCase() + item.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <FieldLabel>Image attachment (optional)</FieldLabel>
              {attachmentUri ? (
                <View style={styles.imagePreviewWrap}>
                  <Image
                    source={{ uri: attachmentUri }}
                    style={styles.imagePreview}
                  />
                  <Pressable
                    onPress={() => {
                      setAttachmentUri(null);
                      setAttachmentPath(null);
                      setAttachmentMime(null);
                    }}
                    style={styles.removeImage}
                  >
                    <Feather name="x" size={17} color={C.white} />
                  </Pressable>
                </View>
              ) : attachmentPath ? (
                <View style={styles.attachmentSaved}>
                  <Feather name="image" size={18} color={C.purple} />
                  <Text style={styles.rowSub}>Existing image attached</Text>
                  <Pressable
                    onPress={() => {
                      setAttachmentPath(null);
                      setAttachmentMime(null);
                    }}
                  >
                    <Feather name="x-circle" size={18} color={C.red} />
                  </Pressable>
                </View>
              ) : null}
              <Pressable
                onPress={() => void pickImage()}
                style={styles.uploadButton}
              >
                <Feather name="image" size={19} color={C.purple} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.outlineText}>
                    {attachmentUri || attachmentPath
                      ? "Change image"
                      : "Attach an image"}
                  </Text>
                  <Text style={styles.rowSub}>
                    JPG, PNG or WebP · up to 8 MB
                  </Text>
                </View>
                <Feather name="upload-cloud" size={19} color={C.purple} />
              </Pressable>
            </Section>

            <Section
              title="Delivery"
              subtitle="Send now, schedule once, or automate repeats"
              icon="calendar"
            >
              <View style={styles.modeOption}>
                <Pressable
                  onPress={() => setDeliveryMode("now")}
                  style={[
                    styles.modeCard,
                    deliveryMode === "now" && styles.modeCardActive,
                  ]}
                >
                  <Feather
                    name="send"
                    size={19}
                    color={deliveryMode === "now" ? C.purple : C.muted}
                  />
                  <Text
                    style={[
                      styles.modeTitle,
                      deliveryMode === "now" && styles.modeTitleActive,
                    ]}
                  >
                    Send now
                  </Text>
                  <Text style={styles.rowSub}>Deliver immediately</Text>
                </Pressable>
                <Pressable
                  onPress={() => setDeliveryMode("once")}
                  style={[
                    styles.modeCard,
                    deliveryMode === "once" && styles.modeCardActive,
                  ]}
                >
                  <Feather
                    name="calendar"
                    size={19}
                    color={deliveryMode === "once" ? C.purple : C.muted}
                  />
                  <Text
                    style={[
                      styles.modeTitle,
                      deliveryMode === "once" && styles.modeTitleActive,
                    ]}
                  >
                    Schedule once
                  </Text>
                  <Text style={styles.rowSub}>One future delivery</Text>
                </Pressable>
              </View>
              <Pressable
                onPress={() => setDeliveryMode("recurring")}
                style={[
                  styles.recurringOption,
                  deliveryMode === "recurring" && styles.modeCardActive,
                ]}
              >
                <View style={styles.recurringIcon}>
                  <Feather name="repeat" size={19} color={C.purple} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Automatic recurring</Text>
                  <Text style={styles.rowSub}>
                    Repeat daily, weekly, weekdays or monthly
                  </Text>
                </View>
                <View
                  style={[
                    styles.radioOuter,
                    deliveryMode === "recurring" && styles.radioOuterActive,
                  ]}
                >
                  {deliveryMode === "recurring" && (
                    <View style={styles.radioInner} />
                  )}
                </View>
              </Pressable>
              {deliveryMode === "once" && (
                <>
                  <FieldLabel>Delivery date (YYYY-MM-DD)</FieldLabel>
                  <TextInput
                    value={scheduledDate}
                    onChangeText={setScheduledDate}
                    placeholder="2026-11-01"
                    placeholderTextColor="#9CA3AF"
                    style={styles.input}
                    autoCapitalize="none"
                  />
                  <FieldLabel>Delivery time (24-hour, India time)</FieldLabel>
                  <TextInput
                    value={scheduledTime}
                    onChangeText={setScheduledTime}
                    placeholder="08:00"
                    placeholderTextColor="#9CA3AF"
                    style={styles.input}
                  />
                </>
              )}
              {deliveryMode === "recurring" && (
                <>
                  <FieldLabel>Repeat</FieldLabel>
                  <View style={styles.chipWrap}>
                    {(["daily", "weekdays", "weekly", "monthly"] as const).map(
                      (item) => (
                        <Pressable
                          key={item}
                          onPress={() => setRecurrence(item)}
                          style={[
                            styles.chip,
                            recurrence === item && styles.chipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              recurrence === item && styles.chipTextActive,
                            ]}
                          >
                            {item === "weekdays"
                              ? "Weekdays"
                              : item[0].toUpperCase() + item.slice(1)}
                          </Text>
                        </Pressable>
                      ),
                    )}
                  </View>
                  <FieldLabel>Start date (YYYY-MM-DD)</FieldLabel>
                  <TextInput
                    value={startDate}
                    onChangeText={setStartDate}
                    placeholder="2026-10-28"
                    placeholderTextColor="#9CA3AF"
                    style={styles.input}
                  />
                  <FieldLabel>Send time (24-hour, India time)</FieldLabel>
                  <TextInput
                    value={scheduledTime}
                    onChangeText={setScheduledTime}
                    placeholder="08:00"
                    placeholderTextColor="#9CA3AF"
                    style={styles.input}
                  />
                  <FieldLabel>End date (optional, YYYY-MM-DD)</FieldLabel>
                  <TextInput
                    value={endDate}
                    onChangeText={setEndDate}
                    placeholder="No end date"
                    placeholderTextColor="#9CA3AF"
                    style={styles.input}
                  />
                  <Text style={styles.helper}>
                    Recurring schedules are saved in Asia/Kolkata. A server-side
                    scheduler must be deployed to deliver future occurrences.
                  </Text>
                </>
              )}
            </Section>

            <View style={styles.previewCard}>
              <View style={styles.previewHeader}>
                <Feather name="smartphone" size={17} color={C.purple} />
                <Text style={styles.previewLabel}>PUSH PREVIEW</Text>
              </View>
              <View style={styles.previewNotification}>
                <View style={styles.previewAppIcon}>
                  <Feather name="book-open" size={17} color={C.white} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.previewApp}>GyanDeep Academy · now</Text>
                  <Text style={styles.previewTitle}>
                    {title.trim() || "Your notice title"}
                  </Text>
                  <Text style={styles.previewBody} numberOfLines={3}>
                    {body.trim() || "Your notice message will appear here."}
                  </Text>
                  {attachmentUri || attachmentPath ? (
                    <Text style={styles.previewImageHint}>
                      Image attached · visible in the full notice
                    </Text>
                  ) : null}
                </View>
              </View>
              <Text style={styles.helper}>
                Android may display only text in the system notification. The
                full image can be shown when the teacher opens the notice.
              </Text>
            </View>

            <View style={styles.actions}>
              <Pressable
                disabled={saving}
                onPress={() => void saveNotice("draft")}
                style={[styles.secondaryAction, saving && styles.disabled]}
              >
                <Feather name="save" size={17} color={C.purple} />
                <Text style={styles.secondaryActionText}>Save draft</Text>
              </Pressable>
              {deliveryMode === "now" ? (
                <Pressable
                  disabled={saving}
                  onPress={() => void saveNotice("send")}
                  style={[styles.primaryAction, saving && styles.disabled]}
                >
                  {saving ? (
                    <ActivityIndicator color={C.white} />
                  ) : (
                    <>
                      <Feather name="send" size={17} color={C.white} />
                      <Text style={styles.primaryActionText}>
                        {editing ? "Save & send" : "Send notice"}
                      </Text>
                    </>
                  )}
                </Pressable>
              ) : (
                <Pressable
                  disabled={saving}
                  onPress={() => void saveNotice("schedule")}
                  style={[styles.primaryAction, saving && styles.disabled]}
                >
                  {saving ? (
                    <ActivityIndicator color={C.white} />
                  ) : (
                    <>
                      <Feather name="calendar" size={17} color={C.white} />
                      <Text style={styles.primaryActionText}>
                        {editing ? "Update schedule" : "Schedule notice"}
                      </Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

function Section({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <View style={styles.sectionIcon}>
          <Feather name={icon} size={18} color={C.purple} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  hero: {
    paddingHorizontal: 18,
    paddingBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },
  back: {
    width: 38,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    color: "#DCCBFF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  heroTitle: { color: C.white, fontSize: 25, fontWeight: "900", marginTop: 3 },
  heroSub: { color: "#E7DBFF", fontSize: 12, marginTop: 4 },
  content: { padding: 15, gap: 14 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  muted: { color: C.muted, fontSize: 13 },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: { flex: 1, color: C.red, fontSize: 13, lineHeight: 18 },
  section: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 23,
    padding: 15,
    gap: 12,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 3,
  },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#EEE5FF",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { color: C.text, fontSize: 17, fontWeight: "900" },
  sectionSubtitle: { color: C.muted, fontSize: 11, marginTop: 3 },
  allRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 11,
    borderRadius: 15,
    backgroundColor: "#FAF9FF",
  },
  checkbox: {
    width: 21,
    height: 21,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "#C9C1DC",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: { backgroundColor: C.purple, borderColor: C.purple },
  rowTitle: { color: C.text, fontSize: 13, fontWeight: "800" },
  rowSub: { color: C.muted, fontSize: 11, marginTop: 3 },
  outlineButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#D9CEF4",
    borderRadius: 13,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  outlineText: { color: C.purple, fontSize: 12, fontWeight: "800", flex: 1 },
  searchInput: {
    height: 45,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    color: C.text,
    backgroundColor: "#FCFBFF",
  },
  teacherRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#F1EEF8",
  },
  avatar: {
    width: 35,
    height: 35,
    borderRadius: 13,
    backgroundColor: "#EEE5FF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: C.purple, fontWeight: "900", fontSize: 11 },
  helper: { color: C.muted, fontSize: 11, lineHeight: 16 },
  fieldLabel: { color: C.text, fontSize: 12, fontWeight: "900", marginTop: 3 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: C.text,
    fontSize: 14,
    backgroundColor: "#FDFDFF",
  },
  messageInput: { minHeight: 120, textAlignVertical: "top" },
  counterRow: { flexDirection: "row", justifyContent: "space-between" },
  fieldHint: { color: C.muted, fontSize: 10 },
  counter: { color: C.muted, fontSize: 10, textAlign: "right" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#F8F6FF",
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: { backgroundColor: C.purple, borderColor: C.purple },
  chipText: { color: C.muted, fontSize: 11, fontWeight: "800" },
  chipTextActive: { color: C.white },
  segmentRow: { flexDirection: "row", gap: 6 },
  segment: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 11,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  segmentActive: { backgroundColor: "#EEE5FF", borderColor: C.lavender },
  segmentText: { color: C.muted, fontSize: 10, fontWeight: "800" },
  segmentTextActive: { color: C.purple },
  imagePreviewWrap: {
    height: 175,
    borderRadius: 15,
    overflow: "hidden",
    position: "relative",
  },
  imagePreview: { width: "100%", height: "100%", resizeMode: "cover" },
  removeImage: {
    position: "absolute",
    right: 9,
    top: 9,
    width: 31,
    height: 31,
    borderRadius: 11,
    backgroundColor: "rgba(31,41,55,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentSaved: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    backgroundColor: "#F7F3FF",
    borderRadius: 12,
  },
  uploadButton: {
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#C9B9EF",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FCFAFF",
  },
  modeOption: { flexDirection: "row", gap: 9 },
  modeCard: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 15,
    gap: 6,
    backgroundColor: "#FFFFFF",
  },
  modeCardActive: { borderColor: C.purple, backgroundColor: "#F6F1FF" },
  modeTitle: { color: C.text, fontSize: 12, fontWeight: "900" },
  modeTitleActive: { color: C.purple },
  recurringOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: C.border,
  },
  recurringIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#EEE5FF",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#C9C1DC",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterActive: { borderColor: C.purple },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.purple,
  },
  previewCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "#F8F6FF",
    padding: 13,
    gap: 10,
  },
  previewHeader: { flexDirection: "row", alignItems: "center", gap: 7 },
  previewLabel: {
    color: C.purple,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  previewNotification: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: C.white,
    borderRadius: 15,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  previewAppIcon: {
    width: 33,
    height: 33,
    borderRadius: 11,
    backgroundColor: C.purple,
    alignItems: "center",
    justifyContent: "center",
  },
  previewApp: { color: C.muted, fontSize: 10 },
  previewTitle: { color: C.text, fontSize: 13, fontWeight: "900" },
  previewBody: { color: "#4B5563", fontSize: 12, lineHeight: 17 },
  previewImageHint: { color: C.purple, fontSize: 10, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 9 },
  secondaryAction: {
    minHeight: 52,
    paddingHorizontal: 13,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#D8C9F6",
    backgroundColor: C.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  secondaryActionText: { color: C.purple, fontSize: 12, fontWeight: "900" },
  primaryAction: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: 13,
    borderRadius: 15,
    backgroundColor: C.purple,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryActionText: { color: C.white, fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.6 },
});
