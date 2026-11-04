import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../../lib/supabase";

const PURPLE = "#611CD0";
const PURPLE_DARK = "#44109D";
const BG = "#F3F3FF";
const WHITE = "#FFFFFF";
const TEXT = "#241344";
const MUTED = "#718096";
const BORDER = "#E8E3F5";

type GroupType = "common" | "class" | "teachers";
type GroupRow = {
  id: string;
  group_name: string;
  group_type: GroupType;
  invite_link: string;
  class_id: string | null;
  institute_classes?: { name: string } | null;
};

export default function TeacherWhatsAppGroupsScreen() {
  const insets = useSafeAreaInsets();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        router.replace("/teacher/teacher-login" as never);
        return;
      }

      const { data: member, error: memberError } = await supabase
        .from("institute_team_members")
        .select("institute_id")
        .eq("user_id", user.id)
        .eq("role", "teacher")
        .eq("is_active", true)
        .maybeSingle();

      if (memberError) throw memberError;
      if (!member?.institute_id)
        throw new Error("Your active teacher institute could not be found.");

      const id = member.institute_id as string;

      const { data, error } = await supabase
        .from("institute_whatsapp_groups")
        .select(
          "id,group_name,group_type,invite_link,class_id,institute_classes(name)",
        )
        .eq("institute_id", id)
        .eq("is_active", true)
        .order("group_type")
        .order("group_name");

      if (error) throw error;
      setGroups((data ?? []) as unknown as GroupRow[]);
    } catch (e) {
      Alert.alert(
        "Unable to load WhatsApp groups",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openGroup = async (link: string) => {
    try {
      const supported = await Linking.canOpenURL(link);
      if (!supported) {
        Alert.alert(
          "Unable to open link",
          "Your device cannot open this WhatsApp invitation link.",
        );
        return;
      }
      await Linking.openURL(link);
    } catch (e) {
      Alert.alert(
        "Unable to open WhatsApp",
        e instanceof Error ? e.message : "Please try again.",
      );
    }
  };

  const labelFor = (group: GroupRow) => {
    if (group.group_type === "common") return "All Students";
    if (group.group_type === "teachers") return "Teachers";
    return group.institute_classes?.name || "Class-wise";
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={PURPLE_DARK} />
      <LinearGradient
        colors={["#611CD0", "#44109D", "#4C02F7"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 12 }]}
      >
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={21} color={WHITE} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>TEACHER PORTAL</Text>
          <Text style={styles.title}>WhatsApp Groups</Text>
          <Text style={styles.subtitle}>
            Official groups shared by your institute
          </Text>
        </View>
        <View style={styles.headerIcon}>
          <Feather name="message-circle" size={23} color={WHITE} />
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 18) + 24 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={PURPLE}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headingRow}>
          <View>
            <Text style={styles.sectionTitle}>Available groups</Text>
            <Text style={styles.sectionSubtitle}>
              {groups.length} active group{groups.length === 1 ? "" : "s"}
            </Text>
          </View>
          <Pressable onPress={() => void load()} style={styles.refresh}>
            <Feather name="refresh-cw" size={16} color={PURPLE} />
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator
            size="large"
            color={PURPLE}
            style={{ marginTop: 40 }}
          />
        ) : groups.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Feather name="message-circle" size={29} color={PURPLE} />
            </View>
            <Text style={styles.emptyTitle}>No groups available</Text>
            <Text style={styles.emptyText}>
              Your institute owner has not shared any active WhatsApp groups
              yet.
            </Text>
          </View>
        ) : (
          groups.map((group) => (
            <View key={group.id} style={styles.groupCard}>
              <View style={styles.whatsappIcon}>
                <Feather name="message-circle" size={22} color="#16845D" />
              </View>
              <View style={styles.groupInfo}>
                <Text style={styles.groupName}>{group.group_name}</Text>
                <View style={styles.categoryPill}>
                  <Feather
                    name={
                      group.group_type === "teachers"
                        ? "briefcase"
                        : group.group_type === "class"
                          ? "book-open"
                          : "users"
                    }
                    size={11}
                    color={PURPLE}
                  />
                  <Text style={styles.categoryText}>{labelFor(group)}</Text>
                </View>
              </View>
              <Pressable
                onPress={() => void openGroup(group.invite_link)}
                style={({ pressed }) => [
                  styles.openButton,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={styles.openButtonText}>Open</Text>
                <Feather name="external-link" size={14} color={WHITE} />
              </Pressable>
            </View>
          ))
        )}
        <View style={styles.noteCard}>
          <Feather name="info" size={16} color={PURPLE} />
          <Text style={styles.noteText}>
            WhatsApp will open the invitation link. You can review the group and
            choose whether to participate.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 23,
    borderBottomLeftRadius: 27,
    borderBottomRightRadius: 27,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    color: "#D9CCFF",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  title: { color: WHITE, fontSize: 22, fontWeight: "900", marginTop: 4 },
  subtitle: { color: "#E5DAFF", fontSize: 11, marginTop: 4 },
  headerIcon: {
    width: 43,
    height: 43,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.17)",
    alignItems: "center",
    justifyContent: "center",
  },
  content: { padding: 16, gap: 12 },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  sectionTitle: { color: TEXT, fontSize: 18, fontWeight: "900" },
  sectionSubtitle: { color: MUTED, fontSize: 11, marginTop: 3 },
  refresh: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  groupCard: {
    backgroundColor: WHITE,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  whatsappIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#E5F7EF",
    alignItems: "center",
    justifyContent: "center",
  },
  groupInfo: { flex: 1, minWidth: 0 },
  groupName: { color: TEXT, fontSize: 13, fontWeight: "900" },
  categoryPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#F0EBFF",
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 7,
  },
  categoryText: { color: PURPLE, fontSize: 10, fontWeight: "800" },
  openButton: {
    backgroundColor: PURPLE,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  openButtonText: { color: WHITE, fontSize: 11, fontWeight: "900" },
  emptyCard: {
    backgroundColor: WHITE,
    borderRadius: 21,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
    marginTop: 8,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: "#EEE7FF",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { color: TEXT, fontSize: 15, fontWeight: "900", marginTop: 14 },
  emptyText: {
    color: MUTED,
    fontSize: 11,
    textAlign: "center",
    lineHeight: 17,
    marginTop: 6,
  },
  noteCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    backgroundColor: "#EEE7FF",
    borderRadius: 14,
    padding: 13,
    marginTop: 6,
  },
  noteText: { flex: 1, color: "#59427F", fontSize: 10, lineHeight: 16 },
});
