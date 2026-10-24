import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Image, Linking, RefreshControl, ScrollView,
  StatusBar, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

const NAVY = "#1D2D44";
const BLUE = "#3677D5";
const BG = "#F4F7FB";
const MUTED = "#718096";
const WHITE = "#FFFFFF";
const BORDER = "#E7EDF4";
const GREEN = "#16845D";

type Teacher = {
  id: string;
  user_id: string | null;
  institute_id: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  staff_id: string | null;
  photo_url?: string | null;
};

const normalizePhone = (value: string | null | undefined) =>
  (value ?? "").replace(/[^0-9+]/g, "");

async function getPhotoUrl(value: string | null | undefined): Promise<string | null> {
  if (!value?.trim()) return null;
  const raw = value.trim();

  if (/^https?:\/\//i.test(raw)) {
    const marker = "/storage/v1/object/";
    if (!raw.includes(marker)) return raw;
    const match = raw.match(/\/storage\/v1\/object\/(sign|authenticated|public)\/([^/]+)\/(.+?)(?:\?|$)/);
    if (!match) return null;
    const [, visibility, bucket, encodedPath] = match;
    if (visibility === "public") return raw;
    const path = encodedPath.split("/").map((part) => {
      try { return decodeURIComponent(part); } catch { return part; }
    }).join("/");
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    return !error && data?.signedUrl ? data.signedUrl : null;
  }

  const path = raw.replace(/^\/+/, "").replace(/^staff-photos\//, "");
  const { data, error } = await supabase.storage.from("staff-photos").createSignedUrl(path, 3600);
  return !error && data?.signedUrl ? data.signedUrl : null;
}

export default function TeachersDirectoryScreen() {
  const insets = useSafeAreaInsets();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadTeachers = useCallback(async () => {
    setErrorMessage("");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        router.replace("/teacher/teacher-login" as never);
        return;
      }

      const { data: current, error: currentError } = await supabase
        .from("institute_team_members")
        .select("id,user_id,institute_id,role,is_active")
        .eq("user_id", user.id)
        .eq("role", "teacher")
        .eq("is_active", true)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current?.institute_id) throw new Error("Your active teacher profile could not be found.");

      const { data, error } = await supabase
        .from("institute_team_members")
        .select("id,user_id,institute_id,full_name,phone,role,staff_id")
        .eq("institute_id", current.institute_id)
        .eq("role", "teacher")
        .eq("is_active", true)
        .order("full_name", { ascending: true });
      if (error) throw error;

      const colleagues = (data ?? []).filter((item) => item.user_id !== user.id);
      const result = await Promise.all(colleagues.map(async (item) => {
        let photoPath: string | null = null;
        if (item.staff_id) {
          const { data: staff, error: photoError } = await supabase
            .from("institute_staff")
            .select("photo_path")
            .eq("id", item.staff_id)
            .eq("institute_id", current.institute_id)
            .maybeSingle();
          if (photoError) console.warn("[teachers] Photo lookup failed:", photoError.message);
          photoPath = staff?.photo_path ?? null;
        }
        let photo_url: string | null = null;
        try { photo_url = await getPhotoUrl(photoPath); }
        catch (e) { console.warn("[teachers] Photo URL resolution failed:", e); }
        return { ...item, photo_url } as Teacher;
      }));
      setTeachers(result);
    } catch (error) {
      console.error("[teachers] Load failed:", error);
      setErrorMessage(error instanceof Error ? error.message : "Unable to load teachers.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadTeachers(); }, [loadTeachers]);

  const callTeacher = async (phone: string | null) => {
    const number = normalizePhone(phone);
    if (!number) return Alert.alert("Phone unavailable", "No phone number is saved for this teacher.");
    try {
      const url = `tel:${number}`;
      if (!(await Linking.canOpenURL(url))) throw new Error("Calling is not supported on this device.");
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert("Unable to call", e instanceof Error ? e.message : "Please try again.");
    }
  };

  const whatsappTeacher = async (phone: string | null) => {
    let number = normalizePhone(phone).replace(/\D/g, "");
    if (!number) return Alert.alert("Phone unavailable", "No phone number is saved for this teacher.");
    if (number.length === 10) number = `91${number}`;
    try {
      await Linking.openURL(`https://wa.me/${number}`);
    } catch {
      Alert.alert("Unable to open WhatsApp", "Check that WhatsApp is installed and try again.");
    }
  };

  if (loading) return (
    <View style={styles.center}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <ActivityIndicator size="large" color={BLUE} />
      <Text style={styles.loadingText}>Loading teachers…</Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 12 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityRole="button">
          <Feather name="arrow-left" size={21} color={WHITE} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>YOUR INSTITUTE</Text>
          <Text style={styles.title}>Teachers</Text>
          <Text style={styles.subtitle}>Connect with your teaching team</Text>
        </View>
        <View style={styles.headerIcon}><Feather name="users" size={22} color={WHITE} /></View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadTeachers(); }} tintColor={BLUE} />}
      >
        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>Teaching team</Text>
            <Text style={styles.sectionSubtitle}>Other active teachers in your institute</Text>
          </View>
          <View style={styles.countPill}><Text style={styles.countText}>{teachers.length}</Text></View>
        </View>

        {errorMessage ? (
          <View style={styles.emptyCard}>
            <Feather name="alert-circle" size={30} color="#D65B69" />
            <Text style={styles.emptyTitle}>Unable to load teachers</Text>
            <Text style={styles.emptyText}>{errorMessage}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => { setLoading(true); void loadTeachers(); }}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : teachers.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}><Feather name="users" size={28} color={BLUE} /></View>
            <Text style={styles.emptyTitle}>No other teachers yet</Text>
            <Text style={styles.emptyText}>Other active teachers from your institute will appear here.</Text>
          </View>
        ) : teachers.map((teacher) => {
          const name = teacher.full_name?.trim() || "Teacher";
          const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
          const hasPhone = Boolean(normalizePhone(teacher.phone));
          return (
            <View key={teacher.id} style={styles.teacherCard}>
              <View style={styles.teacherTop}>
                <View style={styles.avatar}>
                  {teacher.photo_url
                    ? <Image source={{ uri: teacher.photo_url }} style={styles.photo} resizeMode="cover" />
                    : <Text style={styles.initials}>{initials || "T"}</Text>}
                </View>
                <View style={styles.teacherInfo}>
                  <Text style={styles.teacherName} numberOfLines={2}>{name}</Text>
                  <View style={styles.rolePill}><View style={styles.activeDot} /><Text style={styles.roleText}>Teacher</Text></View>
                  <View style={styles.phoneRow}>
                    <Feather name="phone" size={13} color={MUTED} />
                    <Text style={styles.phoneText} numberOfLines={1}>{teacher.phone || "Phone number not added"}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.callButton, !hasPhone && styles.disabledButton]}
                  onPress={() => void callTeacher(teacher.phone)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${name}`}
                >
                  <Feather name="phone-call" size={16} color={hasPhone ? BLUE : MUTED} />
                  <Text style={[styles.actionText, { color: hasPhone ? BLUE : MUTED }]}>Call</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.whatsappButton, !hasPhone && styles.disabledButton]}
                  onPress={() => void whatsappTeacher(teacher.phone)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`WhatsApp ${name}`}
                >
                  <Feather name="message-circle" size={16} color={hasPhone ? GREEN : MUTED} />
                  <Text style={[styles.actionText, { color: hasPhone ? GREEN : MUTED }]}>WhatsApp</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: BG, padding: 24 },
  loadingText: { color: MUTED, fontSize: 14, marginTop: 12 },
  header: { backgroundColor: NAVY, paddingHorizontal: 20, paddingBottom: 24, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, flexDirection: "row", alignItems: "center", gap: 13 },
  backButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: "#526174", alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1 },
  eyebrow: { color: "#AFC8EA", fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: WHITE, fontSize: 26, fontWeight: "900", marginTop: 4 },
  subtitle: { color: "#C6D3E0", fontSize: 12, marginTop: 5 },
  headerIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: "#30435D", alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 10 },
  sectionTitle: { color: NAVY, fontSize: 20, fontWeight: "900" },
  sectionSubtitle: { color: MUTED, fontSize: 12, marginTop: 4 },
  countPill: { backgroundColor: "#E5EEFC", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, minWidth: 38, alignItems: "center" },
  countText: { color: BLUE, fontSize: 12, fontWeight: "900" },
  teacherCard: { backgroundColor: WHITE, borderRadius: 20, borderWidth: 1, borderColor: BORDER, padding: 16, marginBottom: 13, shadowColor: "#233A56", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  teacherTop: { flexDirection: "row", alignItems: "center", gap: 13 },
  avatar: { width: 66, height: 66, borderRadius: 22, backgroundColor: "#E5EEFC", alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 1, borderColor: "#D8E5F8" },
  photo: { width: "100%", height: "100%" },
  initials: { color: BLUE, fontSize: 22, fontWeight: "900" },
  teacherInfo: { flex: 1 },
  teacherName: { color: NAVY, fontSize: 16, fontWeight: "900" },
  rolePill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#E7F8F0", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, marginTop: 6 },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN },
  roleText: { color: GREEN, fontSize: 10, fontWeight: "800" },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  phoneText: { flex: 1, color: MUTED, fontSize: 12 },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  actionButton: { flex: 1, minHeight: 43, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1 },
  callButton: { backgroundColor: "#EEF4FF", borderColor: "#D7E5FF" },
  whatsappButton: { backgroundColor: "#EAF8F1", borderColor: "#CDEEDC" },
  disabledButton: { opacity: 0.6 },
  actionText: { fontSize: 12, fontWeight: "900" },
  emptyCard: { alignItems: "center", backgroundColor: WHITE, borderRadius: 20, padding: 28, borderWidth: 1, borderColor: BORDER, marginTop: 6 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: "#E8F0FF", alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: NAVY, fontSize: 16, fontWeight: "900", marginTop: 14, textAlign: "center" },
  emptyText: { color: MUTED, fontSize: 13, lineHeight: 20, marginTop: 7, textAlign: "center" },
  retryButton: { backgroundColor: NAVY, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12, marginTop: 14 },
  retryText: { color: WHITE, fontSize: 12, fontWeight: "800" },
});
