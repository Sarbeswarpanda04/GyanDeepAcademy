import React, { useCallback, useState } from "react";
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StatusBar,
  StyleSheet, Text, View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

const C = {
  bg: "#F3F3FF", purple: "#611CD0", purpleDark: "#44109D", purpleBright: "#4C02F7",
  text: "#1F2937", muted: "#718096", border: "#E8E3F5", white: "#FFFFFF",
  lavender: "#C4B5FD", green: "#15803D", greenBg: "#DCFCE7", amber: "#B45309", amberBg: "#FEF3C7",
};

type Notice = {
  id: string; title: string; body: string; category: string; priority: string;
  status: string; delivery_mode: string; created_at: string; published_at: string | null;
  attachment_path: string | null;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function NoticesScreen() {
  const insets = useSafeAreaInsets();
  const [instituteId, setInstituteId] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "draft" | "scheduled" | "recurring">("all");

  const load = useCallback(async () => {
    setError("");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) { router.replace("/login" as never); return; }

      const { data: memberships, error: membershipError } = await supabase
        .from("institute_members").select("institute_id,role").eq("user_id", user.id).limit(2);
      if (membershipError) throw membershipError;
      if (!memberships?.length) throw new Error("No institute is linked to this account.");
      if (memberships.length > 1) throw new Error("Select an institute before managing notices.");
      const id = memberships[0].institute_id as string;
      setInstituteId(id);

      const { data, error: noticesError } = await supabase
        .from("institute_notices")
        .select("id,title,body,category,priority,status,delivery_mode,created_at,published_at,attachment_path")
        .eq("institute_id", id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (noticesError) throw noticesError;
      setNotices((data ?? []) as Notice[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load notices.");
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const filtered = notices.filter((n) => {
    if (filter === "all") return true;
    if (filter === "recurring") return n.delivery_mode === "recurring";
    return n.status === filter;
  });
  const count = (kind: string) => notices.filter((n) => kind === "recurring" ? n.delivery_mode === kind : n.status === kind).length;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={C.purpleDark} />
      <LinearGradient colors={["#611CD0", "#44109D", "#4C02F7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: Math.max(insets.top, 12) + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={22} color={C.white} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>COMMUNICATIONS</Text>
          <Text style={styles.heroTitle}>Notice Center</Text>
          <Text style={styles.heroSub}>Announcements, reminders and schedules</Text>
        </View>
        <View style={styles.heroIcon}><Feather name="bell" size={24} color={C.white} /></View>
      </LinearGradient>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={C.purple} colors={[C.purple]} />}>
        <LinearGradient colors={["#FFFFFF", "#F7F3FF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.createCard}>
          <View style={styles.createIcon}><Feather name="edit-3" size={23} color={C.purple} /></View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.createTitle}>Create a notice</Text>
            <Text style={styles.createSub}>Choose teachers, add an image and set delivery.</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.push("/notice-compose" as never)} style={styles.plusButton}>
            <Feather name="plus" size={22} color={C.white} />
          </Pressable>
        </LinearGradient>

        <View style={styles.statsRow}>
          <Stat label="All notices" value={notices.length} icon="file-text" />
          <Stat label="Scheduled" value={count("scheduled")} icon="calendar" />
          <Stat label="Recurring" value={count("recurring")} icon="repeat" />
        </View>

        <View style={styles.sectionHead}>
          <View><Text style={styles.sectionTitle}>Your notices</Text><Text style={styles.sectionSub}>Manage drafts and delivery plans</Text></View>
          <Pressable onPress={() => void load()} hitSlop={8}><Feather name="refresh-cw" size={18} color={C.purple} /></Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {(["all", "draft", "scheduled", "recurring"] as const).map((item) => (
            <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filterChip, filter === item && styles.filterChipActive]}>
              <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item === "all" ? "All" : item[0].toUpperCase() + item.slice(1)}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? <View style={styles.loading}><ActivityIndicator color={C.purple} /><Text style={styles.muted}>Loading your notices…</Text></View> : error ? (
          <View style={styles.emptyCard}><Feather name="alert-circle" size={28} color="#DC2626" /><Text style={styles.emptyTitle}>Could not load notices</Text><Text style={styles.emptyText}>{error}</Text><Pressable onPress={() => void load()} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable></View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyCard}><View style={styles.emptyIcon}><Feather name="inbox" size={26} color={C.purple} /></View><Text style={styles.emptyTitle}>Nothing here yet</Text><Text style={styles.emptyText}>Create your first notice, select recipients and decide when it should be sent.</Text><Pressable onPress={() => router.push("/notice-compose" as never)} style={styles.retry}><Text style={styles.retryText}>Create notice</Text></Pressable></View>
        ) : filtered.map((notice) => <NoticeCard key={notice.id} notice={notice} onPress={() => router.push({ pathname: "/notice-compose", params: { noticeId: notice.id } } as never)} />)}
        <Text style={styles.footer}>GyanDeep Academy · Learn Today, Lead Tomorrow</Text>
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ComponentProps<typeof Feather>["name"] }) {
  return <View style={styles.statCard}><View style={styles.statIcon}><Feather name={icon} size={16} color={C.purple} /></View><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function NoticeCard({ notice, onPress }: { notice: Notice; onPress: () => void }) {
  const statusColor = notice.status === "published" ? C.green : notice.status === "scheduled" ? C.amber : C.muted;
  const statusBg = notice.status === "published" ? C.greenBg : notice.status === "scheduled" ? C.amberBg : "#F1F0F8";
  return <Pressable onPress={onPress} style={styles.noticeCard}>
    <View style={styles.noticeTop}><View style={styles.categoryIcon}><Feather name={notice.attachment_path ? "image" : "file-text"} size={18} color={C.purple} /></View><View style={{ flex: 1, gap: 3 }}><Text style={styles.noticeTitle} numberOfLines={2}>{notice.title}</Text><Text style={styles.noticeDate}>{formatDate(notice.created_at)}</Text></View><View style={[styles.statusPill, { backgroundColor: statusBg }]}><Text style={[styles.statusText, { color: statusColor }]}>{notice.status}</Text></View></View>
    <Text style={styles.noticeBody} numberOfLines={2}>{notice.body}</Text>
    <View style={styles.noticeBottom}><Text style={styles.metaText}>{notice.category} · {notice.delivery_mode === "recurring" ? "Recurring" : notice.delivery_mode === "once" ? "Scheduled once" : "One-time"}</Text><Feather name="chevron-right" size={18} color={C.muted} /></View>
  </Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  hero: { paddingHorizontal: 18, paddingBottom: 23, flexDirection: "row", alignItems: "center", gap: 12, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
  back: { width: 38, height: 42, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  eyebrow: { color: "#DCCBFF", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  heroTitle: { color: C.white, fontSize: 27, fontWeight: "900", marginTop: 3 }, heroSub: { color: "#E7DBFF", fontSize: 12, marginTop: 4 },
  heroIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 15 },
  createCard: { borderRadius: 23, borderWidth: 1, borderColor: C.border, padding: 15, flexDirection: "row", alignItems: "center", gap: 12 },
  createIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#EEE5FF", alignItems: "center", justifyContent: "center" },
  createTitle: { fontSize: 16, color: C.text, fontWeight: "900" }, createSub: { fontSize: 12, color: C.muted, lineHeight: 17 },
  plusButton: { width: 42, height: 42, borderRadius: 15, backgroundColor: C.purple, alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", gap: 9 }, statCard: { flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 12, gap: 4 },
  statIcon: { width: 29, height: 29, borderRadius: 10, backgroundColor: "#F0E9FF", alignItems: "center", justifyContent: "center", marginBottom: 3 }, statValue: { color: C.text, fontSize: 22, fontWeight: "900" }, statLabel: { color: C.muted, fontSize: 10, fontWeight: "700" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 3 }, sectionTitle: { color: C.text, fontSize: 19, fontWeight: "900" }, sectionSub: { color: C.muted, fontSize: 12, marginTop: 3 },
  filters: { gap: 8, paddingVertical: 2 }, filterChip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 14, backgroundColor: C.white, borderWidth: 1, borderColor: C.border }, filterChipActive: { backgroundColor: C.purple, borderColor: C.purple }, filterText: { color: C.muted, fontSize: 12, fontWeight: "800" }, filterTextActive: { color: C.white },
  loading: { padding: 32, alignItems: "center", gap: 12 }, muted: { color: C.muted, fontSize: 13 },
  emptyCard: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 26, alignItems: "center", gap: 10 }, emptyIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: "#EEE5FF", alignItems: "center", justifyContent: "center" }, emptyTitle: { color: C.text, fontSize: 17, fontWeight: "900", textAlign: "center" }, emptyText: { color: C.muted, fontSize: 13, lineHeight: 19, textAlign: "center" }, retry: { backgroundColor: C.purple, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 13, marginTop: 4 }, retryText: { color: C.white, fontSize: 13, fontWeight: "800" },
  noticeCard: { backgroundColor: C.white, borderRadius: 21, borderWidth: 1, borderColor: C.border, padding: 15, gap: 12 }, noticeTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 }, categoryIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#F0E9FF", alignItems: "center", justifyContent: "center" }, noticeTitle: { color: C.text, fontSize: 15, fontWeight: "900", lineHeight: 20 }, noticeDate: { color: C.muted, fontSize: 11 }, statusPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10 }, statusText: { fontSize: 10, fontWeight: "900", textTransform: "capitalize" }, noticeBody: { color: "#4B5563", fontSize: 13, lineHeight: 19 }, noticeBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#F0EDF8", paddingTop: 10 }, metaText: { color: C.muted, fontSize: 11, textTransform: "capitalize" }, footer: { color: C.muted, textAlign: "center", fontSize: 11, paddingVertical: 12 },
});
