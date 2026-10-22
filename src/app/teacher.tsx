import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../lib/supabase";
import AppAlert, { AppAlertType } from "../components/AppAlert";

const NAVY = "#202F42",
  BG = "#F1F5F8",
  MUTED = "#78909F",
  BORDER = "#DDE5EC",
  WHITE = "#FFFFFF";
type Staff = {
  id: string;
  full_name: string;
  phone: string | null;
  photo_path: string | null;
  staff_type: string;
  salary_type: string;
  salary_amount: number;
  date_of_birth: string | null;
  weekly_holidays: string[] | null;
  status: string;
};
const money = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const titleCase = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : "";

export default function TeacherScreen() {
  const [rows, setRows] = useState<Staff[]>([]);
  const [iid, setIid] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [appAlert, setAppAlert] = useState<{visible:boolean; title:string; message:string; type:AppAlertType}>({visible:false,title:"",message:"",type:"info"});
  const load = useCallback(async () => {
    try {
      const {
        data: { user },
        error: ae,
      } = await supabase.auth.getUser();
      if (ae) throw ae;
      if (!user) throw new Error("Please sign in.");
      const { data: members, error: me } = await supabase
        .from("institute_members")
        .select("institute_id,role")
        .eq("user_id", user.id);
      if (me) throw me;
      if (!members?.length)
        throw new Error("Your account is not linked to an institute.");
      if (members.length !== 1)
        throw new Error("Select one active institute first.");
      setIid(members[0].institute_id);
      const { data, error } = await supabase
        .from("institute_staff")
        .select(
          "id,full_name,phone,photo_path,staff_type,salary_type,salary_amount,date_of_birth,weekly_holidays,status",
        )
        .eq("institute_id", members[0].institute_id)
        .eq("status", "active")
        .order("full_name");
      if (error) throw error;
      const staff = (data ?? []) as Staff[];
      const withPhotos = await Promise.all(
        staff.map(async (s) => {
          if (!s.photo_path) return { ...s, photo_url: null as string | null };
          const { data: p } = await supabase.storage
            .from("staff-photos")
            .createSignedUrl(s.photo_path, 3600);
          return { ...s, photo_url: p?.signedUrl ?? null };
        }),
      );
      setRows(withPhotos as any);
    } catch (e: any) {
      setAppAlert({visible:true,title:"Unable to load teachers",message:e?.message ?? "Please try again.",type:"error"});
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );
  const filtered = rows.filter(
    (x) =>
      x.full_name.toLowerCase().includes(query.toLowerCase()) ||
      (x.phone ?? "").includes(query),
  );
  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <View style={styles.top}>
        <View style={styles.heading}>
          <View>
            <Text style={styles.title}>Teachers</Text>
            <Text style={styles.sub}>
              {rows.length} {rows.length === 1 ? "teacher" : "teachers"}
            </Text>
          </View>
          <View style={styles.searchIcon}>
            <Feather name="users" size={23} color={WHITE} />
          </View>
        </View>
        <Pressable
          style={styles.attendance}
          onPress={() => router.push("/attendance" as never)}
        >
          <View style={styles.calendar}>
            <Feather name="calendar" size={26} color={WHITE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.attTitle}>Mark Attendance</Text>
            <Text style={styles.attSub}>Today · Teacher attendance</Text>
          </View>
          <Feather name="chevron-right" size={24} color="#9DB1BE" />
        </Pressable>
      </View>
      <View style={styles.body}>
        <View style={styles.filterRow}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>All {rows.length}</Text>
          </View>
          <View style={styles.searchBox}>
            <Feather name="search" size={17} color={MUTED} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search teachers"
              placeholderTextColor="#9DB1BE"
              style={styles.searchInput}
            />
          </View>
        </View>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={NAVY} />
            <Text style={styles.emptyText}>Loading teachers…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Feather name="users" size={32} color="#8CA2B1" />
            </View>
            <Text style={styles.emptyTitle}>
              {query ? "No matching teachers" : "No teachers added yet"}
            </Text>
            <Text style={styles.emptyText}>
              {query
                ? "Try another name or phone number."
                : "Add your first teacher to manage salary and attendance."}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: 100 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void load();
                }}
              />
            }
          >
            {filtered.map((item: any) => (
              <Pressable
                key={item.id}
                style={styles.staffCard}
                onPress={() => router.push((`/teacher-details/${item.id}`) as never)}
              >
                {item.photo_url ? (
                  <Image
                    source={{ uri: item.photo_url }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Feather name="user" size={25} color="#6E8798" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.staffName}>{item.full_name}</Text>
                  <Text style={styles.staffMeta}>
                    {titleCase(item.staff_type)}
                    {item.phone ? ` · ${item.phone}` : ""}
                  </Text>
                  <Text style={styles.salary}>
                    {money(item.salary_amount)} /{" "}
                    {item.salary_type === "monthly"
                      ? "month"
                      : item.salary_type === "daily"
                        ? "day"
                        : "batch"}
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color={MUTED} />
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
      <View style={styles.bottom}>
        <Pressable
          style={styles.addButton}
          onPress={() => router.push("/add-teacher" as never)}
        >
          <Feather name="plus" size={25} color={WHITE} />
          <Text style={styles.addText}>Add Teacher</Text>
        </Pressable>
      </View>
      <AppAlert {...appAlert} onCancel={() => setAppAlert(v => ({...v, visible:false}))} />
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  top: { backgroundColor: NAVY, paddingBottom: 20 },
  heading: {
    paddingHorizontal: 20,
    paddingTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 30, fontWeight: "800", color: WHITE },
  sub: { fontSize: 16, color: "#A7BAC7", marginTop: 4 },
  searchIcon: {
    width: 52,
    height: 52,
    borderRadius: 28,
    backgroundColor: "#30445A",
    alignItems: "center",
    justifyContent: "center",
  },
  attendance: {
    marginHorizontal: 18,
    marginTop: 22,
    padding: 16,
    borderRadius: 24,
    backgroundColor: "#293B50",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  calendar: {
    width: 64,
    height: 64,
    borderRadius: 19,
    backgroundColor: "#536D84",
    alignItems: "center",
    justifyContent: "center",
  },
  attTitle: { fontSize: 18, fontWeight: "800", color: WHITE },
  attSub: { fontSize: 14, color: "#A7BAC7", marginTop: 5 },
  body: { flex: 1, paddingHorizontal: 18, paddingTop: 18 },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  pill: {
    backgroundColor: NAVY,
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  pillText: { color: WHITE, fontSize: 16, fontWeight: "800" },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, height: 44, color: NAVY },
  staffCard: {
    backgroundColor: WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 13,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: { width: 56, height: 56, borderRadius: 18, backgroundColor: BG },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#EAF0F4",
    alignItems: "center",
    justifyContent: "center",
  },
  staffName: { fontSize: 16, fontWeight: "800", color: NAVY },
  staffMeta: { fontSize: 12, color: MUTED, marginTop: 4 },
  salary: { fontSize: 13, fontWeight: "700", color: "#397D40", marginTop: 5 },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 70,
  },
  center: { alignItems: "center", paddingTop: 70 },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 25,
    backgroundColor: "#E4EBF0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: NAVY,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    color: MUTED,
    textAlign: "center",
    lineHeight: 21,
    marginTop: 8,
  },
  bottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: WHITE,
    borderTopWidth: 1,
    borderTopColor: "#E5EBF0",
  },
  addButton: {
    height: 64,
    borderRadius: 22,
    backgroundColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  addText: { color: WHITE, fontSize: 20, fontWeight: "800" },
});
