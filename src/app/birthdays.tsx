import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import ViewShot, { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { supabase } from "../lib/supabase";

const NAVY = "#172B4D";
const BLUE = "#3979E8";
const BG = "#F4F7FC";
const MUTED = "#718096";
const PINK = "#E94D88";
const today = new Date();
today.setHours(0, 0, 0, 0);

type Student = {
  id: string;
  institute_id: string;
  full_name: string;
  roll_number: string;
  phone: string | null;
  date_of_birth: string | null;
  photo_path: string | null;
  class_id: string | null;
  status: string;
  className: string;
  photoUrl: string | null;
  nextBirthday: Date;
  daysUntil: number;
};

function birthdayDate(dob: string): Date {
  const [, month, day] = dob.split("-").map(Number);
  const next = new Date(today.getFullYear(), month - 1, day);
  next.setHours(0, 0, 0, 0);
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return next;
}
function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function displayDate(value: Date) {
  return value.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
function normalizePhone(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  return digits;
}
async function getPhotoUrl(path: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const cleanPath = path.replace(/^student-photos\//, "").replace(/^\/+/, "");
  const { data, error } = await supabase.storage
    .from("student-photos")
    .createSignedUrl(cleanPath, 3600);
  if (error) {
    console.warn("Birthday photo URL error", error.message);
    return null;
  }
  return data.signedUrl;
}
function wishMessage(name: string) {
  return `🎉🎂 Happy Birthday, ${name}! 🎂🎉\n\nWishing you a wonderful year filled with happiness, good health, confidence, and success in your studies. Keep learning, keep smiling, and keep shining! ✨📚\n\nWith warm wishes,\nGyanDeep Academy\n“Learn Today, Lead Tomorrow” 💙`;
}

export default function BirthdaysScreen() {
  const [students, setStudents] = useState<Student[]>([]);
  const [instituteName, setInstituteName] = useState("GyanDeep Academy");
  const [loading, setLoading] = useState(true);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const imageRefs = useRef<
    Record<string, React.ElementRef<typeof ViewShot> | null>
  >({});

  const loadBirthdays = useCallback(async () => {
    setLoading(true);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) throw new Error("Please sign in to view birthdays.");
      const { data: memberships, error: memberError } = await supabase
        .from("institute_members")
        .select("institute_id")
        .eq("user_id", auth.user.id);
      if (memberError) throw memberError;
      if (!memberships?.length)
        throw new Error("Your account is not linked to an institute.");
      if (memberships.length !== 1)
        throw new Error("Please select one active institute first.");
      const instituteId = memberships[0].institute_id;
      const [studentResult, classResult, instituteResult] = await Promise.all([
        supabase
          .from("institute_students")
          .select(
            "id,institute_id,full_name,roll_number,phone,date_of_birth,photo_path,class_id,status",
          )
          .eq("institute_id", instituteId)
          .eq("status", "active")
          .not("date_of_birth", "is", null),
        supabase
          .from("institute_classes")
          .select("id,name")
          .eq("institute_id", instituteId),
        supabase
          .from("institutes")
          .select("name")
          .eq("id", instituteId)
          .maybeSingle(),
      ]);
      if (studentResult.error) throw studentResult.error;
      if (classResult.error) throw classResult.error;
      if (instituteResult.error) throw instituteResult.error;
      const classNames = new Map(
        (classResult.data ?? []).map((c: any) => [c.id, c.name]),
      );
      const mapped = await Promise.all(
        (studentResult.data ?? []).map(async (s: any) => {
          const nextBirthday = birthdayDate(s.date_of_birth);
          return {
            ...s,
            className: classNames.get(s.class_id) ?? "Class not assigned",
            photoUrl: await getPhotoUrl(s.photo_path),
            nextBirthday,
            daysUntil: daysBetween(today, nextBirthday),
          } as Student;
        }),
      );
      mapped.sort(
        (a, b) =>
          a.daysUntil - b.daysUntil || a.full_name.localeCompare(b.full_name),
      );
      setStudents(mapped);
      setInstituteName(
        instituteResult.data?.name?.trim() || "GyanDeep Academy",
      );
    } catch (e) {
      Alert.alert(
        "Unable to load birthdays",
        e instanceof Error ? e.message : "Please try again.",
      );
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadBirthdays();
    }, [loadBirthdays]),
  );
  const todays = useMemo(
    () => students.filter((s) => s.daysUntil === 0),
    [students],
  );
  const upcoming = useMemo(
    () => students.filter((s) => s.daysUntil > 0),
    [students],
  );

  async function openWhatsApp(student: Student) {
    if (!student.phone) {
      Alert.alert(
        "Phone number missing",
        "Add a phone number to this student's profile first.",
      );
      return;
    }
    const phone = normalizePhone(student.phone);
    if (phone.length < 10) {
      Alert.alert(
        "Invalid phone number",
        "Check the phone number saved in the student's profile.",
      );
      return;
    }
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(wishMessage(student.full_name))}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        "WhatsApp unavailable",
        "Install WhatsApp or check the phone number and try again.",
      );
    }
  }

  async function shareBirthdayImage(student: Student) {
    setSharingId(student.id);
    try {
      const ref = imageRefs.current[student.id];
      if (!ref)
        throw new Error(
          "Birthday greeting is still preparing. Please try again.",
        );
      const uri = await captureRef(ref, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: `Birthday wishes for ${student.full_name}`,
          UTI: "public.png",
        });
      } else {
        await Share.share({
          message: `Birthday greeting for ${student.full_name}`,
        });
      }
    } catch (e) {
      Alert.alert(
        "Unable to share image",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setSharingId(null);
    }
  }

  function StudentBirthday({
    student,
    isToday,
  }: {
    student: Student;
    isToday: boolean;
  }) {
    return (
      <View style={styles.studentCard}>
        <View style={styles.studentRow}>
          {student.photoUrl ? (
            <Image source={{ uri: student.photoUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Feather name="user" size={25} color={BLUE} />
            </View>
          )}
          <View style={styles.studentInfo}>
            <Text style={styles.studentName}>{student.full_name}</Text>
            <Text style={styles.studentMeta}>
              {student.className} · Roll {student.roll_number || "—"}
            </Text>
            <Text style={styles.birthdayDate}>
              {isToday
                ? "🎂 Birthday today!"
                : `🎈 ${displayDate(student.nextBirthday)} · In ${student.daysUntil} day${student.daysUntil === 1 ? "" : "s"}`}
            </Text>
          </View>
        </View>
        {isToday && (
          <>
            <ViewShot
              ref={(ref) => {
                imageRefs.current[student.id] = ref;
              }}
              options={{ format: "png", quality: 1 }}
              style={styles.greetingImage}
            >
              <View style={styles.greetingDecorTop}>
                <Text style={styles.greetingEmoji}>🎉 🎂 🎈</Text>
              </View>
              <Text style={styles.greetingKicker}>
                A SPECIAL DAY TO CELEBRATE
              </Text>
              <Text style={styles.greetingTitle}>Happy Birthday!</Text>
              <Text style={styles.greetingName}>{student.full_name}</Text>
              <Text style={styles.greetingMessage}>
                May your year be full of joy, bright ideas and wonderful
                achievements.
              </Text>
              <View style={styles.greetingDivider} />
              <Text style={styles.greetingInstitute}>{instituteName}</Text>
              <Text style={styles.greetingTagline}>
                Learn Today, Lead Tomorrow
              </Text>
              <Text style={styles.greetingEmojiBottom}>✨ 💙 ✨</Text>
            </ViewShot>
            <View style={styles.actionsRow}>
              <Pressable
                style={[styles.actionButton, styles.whatsappButton]}
                onPress={() => void openWhatsApp(student)}
              >
                <Feather name="message-circle" size={16} color="#FFFFFF" />
                <Text style={styles.actionText}>WhatsApp wish</Text>
              </Pressable>
              <Pressable
                style={[styles.actionButton, styles.imageButton]}
                onPress={() => void shareBirthdayImage(student)}
                disabled={sharingId === student.id}
              >
                {sharingId === student.id ? (
                  <ActivityIndicator size="small" color={NAVY} />
                ) : (
                  <Feather name="image" size={16} color={NAVY} />
                )}
                <Text style={[styles.actionText, { color: NAVY }]}>
                  Share image
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={NAVY} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Student birthdays</Text>
          <Text style={styles.headerSubtitle}>
            {new Date().toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </Text>
        </View>
        <Pressable
          style={styles.refreshButton}
          onPress={() => void loadBirthdays()}
        >
          <Feather name="refresh-cw" size={18} color={BLUE} />
        </Pressable>
      </View>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.muted}>Finding upcoming birthdays…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Feather name="gift" size={27} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Make their day special</Text>
              <Text style={styles.heroSub}>
                Celebrate every student at {instituteName}.
              </Text>
            </View>
            <View style={styles.heroCount}>
              <Text style={styles.heroCountNumber}>{todays.length}</Text>
              <Text style={styles.heroCountLabel}>TODAY</Text>
            </View>
          </View>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>🎉 Today's birthdays</Text>
              <Text style={styles.sectionSubtitle}>
                Send a little happiness their way
              </Text>
            </View>
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>{todays.length}</Text>
            </View>
          </View>
          {todays.length ? (
            todays.map((s) => (
              <StudentBirthday key={s.id} student={s} isToday />
            ))
          ) : (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Feather name="calendar" size={24} color={BLUE} />
              </View>
              <Text style={styles.emptyTitle}>No birthdays today</Text>
              <Text style={styles.emptyText}>
                There are no student birthdays today. Check the upcoming list
                below.
              </Text>
            </View>
          )}
          <View style={[styles.sectionHeading, { marginTop: 25 }]}>
            <View>
              <Text style={styles.sectionTitle}>🗓️ Coming up</Text>
              <Text style={styles.sectionSubtitle}>
                Upcoming student birthdays, in date order
              </Text>
            </View>
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>{upcoming.length}</Text>
            </View>
          </View>
          {upcoming.length ? (
            upcoming.map((s) => (
              <StudentBirthday key={s.id} student={s} isToday={false} />
            ))
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No upcoming birthdays found</Text>
              <Text style={styles.emptyText}>
                Students with a date of birth will appear here.
              </Text>
            </View>
          )}
          <Text style={styles.footer}>
            GyanDeep Academy · Learn Today, Lead Tomorrow
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: {
    paddingTop: 35,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E8EDF5",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#EAF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: NAVY, fontSize: 20, fontWeight: "900" },
  headerSubtitle: { color: MUTED, fontSize: 12, marginTop: 3 },
  content: { padding: 16, paddingBottom: 36 },
  hero: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    overflow: "hidden",
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: PINK,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" },
  heroSub: { color: "#D7E2F1", fontSize: 12, marginTop: 5, lineHeight: 17 },
  heroCount: {
    minWidth: 55,
    alignItems: "center",
    padding: 8,
    borderRadius: 14,
    backgroundColor: "#FFFFFF1C",
  },
  heroCountNumber: { color: "#FFFFFF", fontSize: 23, fontWeight: "900" },
  heroCountLabel: {
    color: "#D7E2F1",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  sectionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 12,
  },
  sectionTitle: { color: NAVY, fontSize: 18, fontWeight: "900" },
  sectionSubtitle: { color: MUTED, fontSize: 12, marginTop: 4 },
  countPill: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 9,
    backgroundColor: "#E7EEFF",
    alignItems: "center",
    justifyContent: "center",
  },
  countPillText: { color: BLUE, fontWeight: "900" },
  studentCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E6ECF4",
    padding: 13,
    marginBottom: 12,
    shadowColor: NAVY,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  studentRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#E8F0FF",
  },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  studentInfo: { flex: 1, minWidth: 0 },
  studentName: { color: NAVY, fontSize: 15, fontWeight: "900" },
  studentMeta: { color: MUTED, fontSize: 12, marginTop: 4 },
  birthdayDate: { color: PINK, fontSize: 12, fontWeight: "800", marginTop: 6 },
  greetingImage: {
    marginTop: 14,
    borderRadius: 16,
    overflow: "hidden",
    paddingHorizontal: 15,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#FCE8F0",
    borderWidth: 1,
    borderColor: "#F4C6D8",
  },
  greetingDecorTop: { width: "100%", alignItems: "center", paddingBottom: 5 },
  greetingEmoji: { fontSize: 20 },
  greetingKicker: {
    color: "#A53C6B",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginTop: 3,
  },
  greetingTitle: { color: NAVY, fontSize: 23, fontWeight: "900", marginTop: 5 },
  greetingName: {
    color: PINK,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 2,
  },
  greetingMessage: {
    color: "#5D5362",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
    marginTop: 7,
    maxWidth: 270,
  },
  greetingDivider: {
    width: 50,
    height: 2,
    borderRadius: 2,
    backgroundColor: PINK,
    marginTop: 10,
    marginBottom: 8,
  },
  greetingInstitute: { color: NAVY, fontSize: 12, fontWeight: "900" },
  greetingTagline: { color: "#7C7180", fontSize: 9, marginTop: 3 },
  greetingEmojiBottom: { fontSize: 14, marginTop: 8 },
  actionsRow: { flexDirection: "row", gap: 9, marginTop: 12 },
  actionButton: {
    flex: 1,
    minHeight: 43,
    borderRadius: 13,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  whatsappButton: { backgroundColor: "#168B55" },
  imageButton: {
    backgroundColor: "#EEF3FA",
    borderWidth: 1,
    borderColor: "#DDE6F1",
  },
  actionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E6ECF4",
    padding: 22,
    alignItems: "center",
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#EAF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  emptyTitle: {
    color: NAVY,
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  emptyText: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 6,
  },
  muted: { color: MUTED, marginTop: 12 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  footer: {
    color: MUTED,
    fontSize: 11,
    textAlign: "center",
    marginTop: 20,
    marginBottom: 8,
  },
});
