import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
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

const NAVY = "#32106B";
const PURPLE = "#6D28D9";
const BG = "#F5F3FF";
const MUTED = "#7B8498";
const BORDER = "#E8E2F4";
const WHITE = "#FFFFFF";
const GREEN = "#16804A";
const WHATSAPP = "#168A52";

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
  photo_url?: string | null;
};

const money = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

const titleCase = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : "";

export default function TeacherScreen() {
  const [rows, setRows] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const [appAlert, setAppAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: AppAlertType;
  }>({
    visible: false,
    title: "",
    message: "",
    type: "info",
  });

  const load = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Please sign in.");

      const { data: members, error: memberError } = await supabase
        .from("institute_members")
        .select("institute_id, role")
        .eq("user_id", user.id);

      if (memberError) throw memberError;

      if (!members?.length) {
        throw new Error("Your account is not linked to an institute.");
      }

      if (members.length !== 1) {
        throw new Error("Select one active institute first.");
      }

      const instituteId = members[0].institute_id;

      const staffResult = await supabase
        .from("institute_staff")
        .select(
          "id,full_name,phone,photo_path,staff_type,salary_type,salary_amount,date_of_birth,weekly_holidays,status",
        )
        .eq("institute_id", instituteId)
        .eq("status", "active")
        .order("full_name");

      if (staffResult.error) throw staffResult.error;

      const staff = (staffResult.data ?? []) as Staff[];

      const staffWithPhotos = await Promise.all(
        staff.map(async (person) => {
          if (!person.photo_path) {
            return { ...person, photo_url: null };
          }

          const { data, error } = await supabase.storage
            .from("staff-photos")
            .createSignedUrl(person.photo_path, 3600);

          if (error) {
            return { ...person, photo_url: null };
          }

          return {
            ...person,
            photo_url: data?.signedUrl ?? null,
          };
        }),
      );

      setRows(staffWithPhotos);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Please try again.";

      setAppAlert({
        visible: true,
        title: "Unable to load teachers",
        message,
        type: "error",
      });
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

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();

    if (!search) return rows;

    return rows.filter(
      (person) =>
        person.full_name.toLowerCase().includes(search) ||
        (person.phone ?? "").toLowerCase().includes(search),
    );
  }, [rows, query]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={PURPLE} />

      <View style={styles.top}>
        <View style={styles.heading}>
          <View>
            <Text style={styles.title}>Teachers</Text>
            <Text style={styles.sub}>
              {rows.length} {rows.length === 1 ? "teacher" : "teachers"}
            </Text>
          </View>

          <View style={styles.headerIcon}>
            <Feather name="users" size={23} color={WHITE} />
          </View>
        </View>

        <Pressable
          style={styles.attendance}
          onPress={() => router.push("/staff-attendance" as never)}
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
          <ScrollView
            contentContainerStyle={styles.empty}
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
          </ScrollView>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 110 }}
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
            {filtered.map((item) => {
              return (
                <View key={item.id} style={styles.staffCard}>
                  <Pressable
                    style={styles.staffHeader}
                    onPress={() =>
                      router.push(`/teacher-details/${item.id}` as never)
                    }
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

                  <View style={styles.contactActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Call ${item.full_name}`}
                      disabled={!item.phone}
                      onPress={() => {
                        if (item.phone) {
                          void Linking.openURL(`tel:${item.phone.replace(/[^+\d]/g, "")}`);
                        }
                      }}
                      style={({ pressed }) => [
                        styles.contactButton,
                        styles.callButton,
                        !item.phone && styles.disabledButton,
                        pressed && item.phone ? styles.pressedButton : null,
                      ]}
                    >
                      <Feather name="phone" size={16} color={item.phone ? PURPLE : MUTED} />
                      <Text style={[styles.contactButtonText, { color: item.phone ? PURPLE : MUTED }]}>Call</Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`WhatsApp ${item.full_name}`}
                      disabled={!item.phone}
                      onPress={() => {
                        if (item.phone) {
                          const digits = item.phone.replace(/\D/g, "");
                          const internationalNumber = digits.length === 10 ? `91${digits}` : digits;
                          void Linking.openURL(`https://wa.me/${internationalNumber}`);
                        }
                      }}
                      style={({ pressed }) => [
                        styles.contactButton,
                        styles.whatsappButton,
                        !item.phone && styles.disabledButton,
                        pressed && item.phone ? styles.pressedButton : null,
                      ]}
                    >
                      <Feather name="message-circle" size={16} color={item.phone ? WHITE : MUTED} />
                      <Text style={[styles.contactButtonText, { color: item.phone ? WHITE : MUTED }]}>WhatsApp</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
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

      <AppAlert
        {...appAlert}
        onCancel={() =>
          setAppAlert((current) => ({
            ...current,
            visible: false,
          }))
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  top: {
    backgroundColor: PURPLE,
    paddingBottom: 22,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heading: {
    paddingHorizontal: 20,
    paddingTop: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 30, fontWeight: "800", color: WHITE, letterSpacing: -0.6 },
  sub: { fontSize: 14, color: "#E5D9FF", marginTop: 5, fontWeight: "500" },
  headerIcon: {
    width: 50, height: 50, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  attendance: {
    marginHorizontal: 18, marginTop: 22, padding: 12, borderRadius: 20,
    backgroundColor: "#4D1BA2", flexDirection: "row", alignItems: "center", gap: 13,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  calendar: {
    width: 52, height: 52, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center", justifyContent: "center",
  },
  attTitle: { fontSize: 16, fontWeight: "800", color: WHITE },
  attSub: { fontSize: 12, color: "#E1D4FF", marginTop: 5 },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 18 },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  pill: {
    backgroundColor: "#E9DFFF", borderRadius: 14, paddingHorizontal: 15, paddingVertical: 12,
    borderWidth: 1, borderColor: "#D8C7FF",
  },
  pillText: { color: NAVY, fontSize: 14, fontWeight: "800" },
  searchBox: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 9, borderRadius: 15,
    borderWidth: 1, borderColor: BORDER, backgroundColor: WHITE, paddingHorizontal: 13,
    shadowColor: "#32106B", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },
  searchInput: { flex: 1, height: 46, color: NAVY, fontSize: 14 },
  staffCard: {
    backgroundColor: WHITE, borderRadius: 22, borderWidth: 1, borderColor: BORDER,
    padding: 14, marginBottom: 13, shadowColor: "#32106B", shadowOpacity: 0.06,
    shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2,
  },
  staffHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 58, height: 58, borderRadius: 19, backgroundColor: BG },
  avatarFallback: {
    width: 58, height: 58, borderRadius: 19, backgroundColor: "#EEE7FF",
    alignItems: "center", justifyContent: "center",
  },
  staffName: { fontSize: 16, fontWeight: "800", color: NAVY, letterSpacing: -0.2 },
  staffMeta: { fontSize: 12, color: MUTED, marginTop: 4 },
  salary: { fontSize: 13, fontWeight: "800", color: GREEN, marginTop: 7 },
  contactActions: { flexDirection: "row", gap: 10, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#F0ECF7" },
  contactButton: {
    flex: 1, minHeight: 44, borderRadius: 13, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 10,
  },
  callButton: { backgroundColor: "#F1EAFE", borderWidth: 1, borderColor: "#E3D5FF" },
  whatsappButton: { backgroundColor: WHATSAPP },
  contactButtonText: { fontSize: 14, fontWeight: "800" },
  disabledButton: { backgroundColor: "#F0F1F5", borderColor: "#E5E7EB", opacity: 0.8 },
  pressedButton: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  center: { alignItems: "center", paddingTop: 70 },
  empty: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingTop: 50 },
  emptyIcon: {
    width: 76, height: 76, borderRadius: 25, backgroundColor: "#E9E1FA",
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: NAVY, textAlign: "center" },
  emptyText: { fontSize: 14, color: MUTED, textAlign: "center", lineHeight: 21, marginTop: 8 },
  bottom: {
    position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 18,
    paddingTop: 12, paddingBottom: 12, backgroundColor: WHITE,
    borderTopWidth: 1, borderTopColor: BORDER,
  },
  addButton: {
    height: 56, borderRadius: 17, backgroundColor: PURPLE, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 10,
    shadowColor: PURPLE, shadowOpacity: 0.22, shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 }, elevation: 4,
  },
  addText: { color: WHITE, fontSize: 16, fontWeight: "800" },
});
