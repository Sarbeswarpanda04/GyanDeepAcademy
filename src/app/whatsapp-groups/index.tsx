import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

const PURPLE = "#611CD0";
const PURPLE_DARK = "#44109D";
const BG = "#F3F3FF";
const WHITE = "#FFFFFF";
const TEXT = "#241344";
const MUTED = "#718096";
const BORDER = "#E8E3F5";

type GroupType = "common" | "class" | "teachers";
type ClassRow = { id: string; name: string };
type GroupRow = {
  id: string;
  institute_id: string;
  group_name: string;
  group_type: GroupType;
  class_id: string | null;
  invite_link: string;
  is_active: boolean;
  created_at: string;
  institute_classes?: { name: string } | null;
};

const TYPES: {
  key: GroupType;
  label: string;
  icon: keyof typeof Feather.glyphMap;
}[] = [
  { key: "common", label: "All Students", icon: "users" },
  { key: "class", label: "Class-wise", icon: "book-open" },
  { key: "teachers", label: "Teachers", icon: "briefcase" },
];

function validWhatsAppLink(value: string) {
  return /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+\/?$/i.test(value.trim());
}

export default function OwnerWhatsAppGroupsScreen() {
  const insets = useSafeAreaInsets();
  const [instituteId, setInstituteId] = useState("");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupType, setGroupType] = useState<GroupType>("common");
  const [classId, setClassId] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
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

      const { data: membership, error: membershipError } = await supabase
        .from("institute_members")
        .select("institute_id")
        .eq("user_id", user.id)
        .eq("role", "owner")
        .limit(2);
      if (membershipError) throw membershipError;
      if (!membership?.length)
        throw new Error("No owner institute is linked to this account.");
      if (membership.length > 1)
        throw new Error(
          "This account is linked to multiple institutes. Institute selection is required.",
        );

      const id = membership[0].institute_id as string;
      setInstituteId(id);

      const [classResult, groupResult] = await Promise.all([
        supabase
          .from("institute_classes")
          .select("id,name")
          .eq("institute_id", id)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("institute_whatsapp_groups")
          .select(
            "id,institute_id,group_name,group_type,class_id,invite_link,is_active,created_at,institute_classes(name)",
          )
          .eq("institute_id", id)
          .order("created_at", { ascending: false }),
      ]);
      if (classResult.error) throw classResult.error;
      if (groupResult.error) throw groupResult.error;
      setClasses((classResult.data ?? []) as ClassRow[]);
      setGroups((groupResult.data ?? []) as unknown as GroupRow[]);
    } catch (e) {
      Alert.alert(
        "Unable to load groups",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setGroupName("");
    setGroupType("common");
    setClassId("");
    setInviteLink("");
    setEditingId(null);
  };

  const saveGroup = async () => {
    const name = groupName.trim();
    const link = inviteLink.trim();
    if (name.length < 2) {
      Alert.alert(
        "Group name required",
        "Enter a group name with at least 2 characters.",
      );
      return;
    }
    if (!validWhatsAppLink(link)) {
      Alert.alert(
        "Invalid WhatsApp link",
        "Paste a valid invitation link beginning with https://chat.whatsapp.com/.",
      );
      return;
    }
    if (groupType === "class" && !classId) {
      Alert.alert(
        "Select a class",
        "Choose the class for this WhatsApp group.",
      );
      return;
    }
    if (!instituteId) return;

    setSaving(true);
    try {
      const payload = {
        institute_id: instituteId,
        group_name: name,
        group_type: groupType,
        class_id: groupType === "class" ? classId : null,
        invite_link: link,
      };

      const result = editingId
        ? await supabase
            .from("institute_whatsapp_groups")
            .update(payload)
            .eq("id", editingId)
            .eq("institute_id", instituteId)
        : await supabase.from("institute_whatsapp_groups").insert(payload);

      if (result.error) throw result.error;
      resetForm();
      await load();
      Alert.alert("Saved", "WhatsApp group has been saved.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Please try again.";
      if (
        message.toLowerCase().includes("duplicate") ||
        message.toLowerCase().includes("unique")
      ) {
        Alert.alert(
          "Group already exists",
          "A group of this type is already saved. Edit the existing group instead.",
        );
      } else {
        Alert.alert("Unable to save group", message);
      }
    } finally {
      setSaving(false);
    }
  };

  const editGroup = (group: GroupRow) => {
    setEditingId(group.id);
    setGroupName(group.group_name);
    setGroupType(group.group_type);
    setClassId(group.class_id ?? "");
    setInviteLink(group.invite_link);
  };

  const toggleActive = async (group: GroupRow) => {
    const { error } = await supabase
      .from("institute_whatsapp_groups")
      .update({ is_active: !group.is_active })
      .eq("id", group.id)
      .eq("institute_id", instituteId);
    if (error) Alert.alert("Update failed", error.message);
    else await load();
  };

  const deleteGroup = (group: GroupRow) => {
    Alert.alert("Delete WhatsApp group?", `Delete "${group.group_name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from("institute_whatsapp_groups")
            .delete()
            .eq("id", group.id)
            .eq("institute_id", instituteId);
          if (error) Alert.alert("Delete failed", error.message);
          else {
            if (editingId === group.id) resetForm();
            await load();
          }
        },
      },
    ]);
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
          <Text style={styles.headerEyebrow}>INSTITUTE MANAGEMENT</Text>
          <Text style={styles.headerTitle}>WhatsApp Groups</Text>
          <Text style={styles.headerSubtitle}>
            Manage student and teacher group links
          </Text>
        </View>
        <View style={styles.headerIcon}>
          <Feather name="message-circle" size={23} color={WHITE} />
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 18) + 28 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.formCard}>
            <View style={styles.cardHeading}>
              <View style={styles.headingIcon}>
                <Feather
                  name={editingId ? "edit-3" : "plus"}
                  size={18}
                  color={PURPLE}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>
                  {editingId ? "Edit WhatsApp Group" : "Add WhatsApp Group"}
                </Text>
                <Text style={styles.cardSubtitle}>
                  Save an invitation link for your institute
                </Text>
              </View>
            </View>

            <Text style={styles.label}>Group type</Text>
            <View style={styles.typeRow}>
              {TYPES.map((type) => (
                <Pressable
                  key={type.key}
                  onPress={() => {
                    setGroupType(type.key);
                    if (type.key !== "class") setClassId("");
                  }}
                  style={[
                    styles.typeOption,
                    groupType === type.key && styles.typeOptionActive,
                  ]}
                >
                  <Feather
                    name={type.icon}
                    size={17}
                    color={groupType === type.key ? WHITE : PURPLE}
                  />
                  <Text
                    style={[
                      styles.typeText,
                      groupType === type.key && styles.typeTextActive,
                    ]}
                  >
                    {type.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {groupType === "class" ? (
              <>
                <Text style={styles.label}>Select class</Text>
                {classes.length ? (
                  <View style={styles.classWrap}>
                    {classes.map((item) => (
                      <Pressable
                        key={item.id}
                        onPress={() => setClassId(item.id)}
                        style={[
                          styles.classChip,
                          classId === item.id && styles.classChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.classChipText,
                            classId === item.id && styles.classChipTextActive,
                          ]}
                        >
                          {item.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.helper}>
                    No active classes found. Add a class first.
                  </Text>
                )}
              </>
            ) : null}

            <Text style={styles.label}>Group name</Text>
            <TextInput
              value={groupName}
              onChangeText={setGroupName}
              placeholder="e.g. GyanDeep Academy Students"
              placeholderTextColor="#A0A7B8"
              style={styles.input}
              maxLength={100}
            />

            <Text style={styles.label}>WhatsApp invitation link</Text>
            <TextInput
              value={inviteLink}
              onChangeText={setInviteLink}
              placeholder="https://chat.whatsapp.com/..."
              placeholderTextColor="#A0A7B8"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Text style={styles.helper}>
              Paste the group invite link copied from WhatsApp.
            </Text>

            <Pressable
              onPress={() => void saveGroup()}
              disabled={saving || (groupType === "class" && !classes.length)}
              style={({ pressed }) => [
                styles.saveButton,
                (saving || (groupType === "class" && !classes.length)) && {
                  opacity: 0.6,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              {saving ? (
                <ActivityIndicator color={WHITE} />
              ) : (
                <Feather name="save" size={17} color={WHITE} />
              )}
              <Text style={styles.saveButtonText}>
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Update Group"
                    : "Save WhatsApp Group"}
              </Text>
            </Pressable>
            {editingId ? (
              <Pressable onPress={resetForm} style={styles.cancelEdit}>
                <Text style={styles.cancelEditText}>Cancel editing</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.listHeading}>
            <View>
              <Text style={styles.listTitle}>Saved groups</Text>
              <Text style={styles.listSubtitle}>
                {groups.length} group{groups.length === 1 ? "" : "s"} configured
              </Text>
            </View>
            <Pressable onPress={() => void load()} style={styles.refreshButton}>
              <Feather name="refresh-cw" size={16} color={PURPLE} />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator
              color={PURPLE}
              size="large"
              style={{ marginTop: 30 }}
            />
          ) : groups.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Feather name="message-circle" size={27} color={PURPLE} />
              </View>
              <Text style={styles.emptyTitle}>No WhatsApp groups yet</Text>
              <Text style={styles.emptyText}>
                Add your common, class-wise or teachers group above.
              </Text>
            </View>
          ) : (
            groups.map((group) => {
              const category =
                group.group_type === "common"
                  ? "All Students"
                  : group.group_type === "teachers"
                    ? "Teachers"
                    : group.institute_classes?.name ||
                      classes.find((c) => c.id === group.class_id)?.name ||
                      "Class group";
              return (
                <View key={group.id} style={styles.groupCard}>
                  <View style={styles.groupIcon}>
                    <Feather name="message-circle" size={20} color="#16845D" />
                  </View>
                  <View style={styles.groupInfo}>
                    <Text style={styles.groupName}>{group.group_name}</Text>
                    <Text style={styles.groupCategory}>{category}</Text>
                    <Text
                      style={[
                        styles.status,
                        group.is_active
                          ? styles.statusActive
                          : styles.statusInactive,
                      ]}
                    >
                      {group.is_active
                        ? "Visible to teachers"
                        : "Hidden from teachers"}
                    </Text>
                  </View>
                  <View style={styles.groupActions}>
                    <Pressable
                      onPress={() => editGroup(group)}
                      style={styles.actionButton}
                    >
                      <Feather name="edit-2" size={16} color={PURPLE} />
                    </Pressable>
                    <Pressable
                      onPress={() => void toggleActive(group)}
                      style={styles.actionButton}
                    >
                      <Feather
                        name={group.is_active ? "eye-off" : "eye"}
                        size={16}
                        color={PURPLE}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => deleteGroup(group)}
                      style={styles.actionButton}
                    >
                      <Feather name="trash-2" size={16} color="#D14343" />
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  headerEyebrow: {
    color: "#D9CCFF",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  headerTitle: { color: WHITE, fontSize: 22, fontWeight: "900", marginTop: 4 },
  headerSubtitle: { color: "#E5DAFF", fontSize: 11, marginTop: 4 },
  headerIcon: {
    width: 43,
    height: 43,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.17)",
    alignItems: "center",
    justifyContent: "center",
  },
  content: { padding: 16, gap: 15 },
  formCard: {
    backgroundColor: WHITE,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
  },
  cardHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginBottom: 18,
  },
  headingIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#EEE7FF",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { color: TEXT, fontSize: 16, fontWeight: "900" },
  cardSubtitle: { color: MUTED, fontSize: 11, marginTop: 3 },
  label: {
    color: TEXT,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 8,
    marginTop: 12,
  },
  typeRow: { flexDirection: "row", gap: 7 },
  typeOption: {
    flex: 1,
    minHeight: 65,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FAF9FF",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 3,
  },
  typeOptionActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  typeText: {
    color: TEXT,
    fontSize: 9,
    fontWeight: "800",
    textAlign: "center",
  },
  typeTextActive: { color: WHITE },
  classWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  classChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#F7F3FF",
    borderWidth: 1,
    borderColor: BORDER,
  },
  classChipActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  classChipText: { color: TEXT, fontSize: 12, fontWeight: "800" },
  classChipTextActive: { color: WHITE },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 13,
    paddingHorizontal: 13,
    color: TEXT,
    fontSize: 13,
    backgroundColor: "#FCFBFF",
  },
  helper: { color: MUTED, fontSize: 10, lineHeight: 15, marginTop: 6 },
  saveButton: {
    minHeight: 49,
    backgroundColor: PURPLE,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 19,
  },
  saveButtonText: { color: WHITE, fontSize: 13, fontWeight: "900" },
  cancelEdit: { alignItems: "center", paddingTop: 12 },
  cancelEditText: { color: MUTED, fontSize: 12, fontWeight: "700" },
  listHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  listTitle: { color: TEXT, fontSize: 18, fontWeight: "900" },
  listSubtitle: { color: MUTED, fontSize: 11, marginTop: 3 },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  emptyCard: {
    backgroundColor: WHITE,
    borderRadius: 20,
    padding: 25,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: "#EEE7FF",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { color: TEXT, fontSize: 14, fontWeight: "900", marginTop: 13 },
  emptyText: {
    color: MUTED,
    fontSize: 11,
    textAlign: "center",
    marginTop: 5,
    lineHeight: 17,
  },
  groupCard: {
    backgroundColor: WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  groupIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#E5F7EF",
    alignItems: "center",
    justifyContent: "center",
  },
  groupInfo: { flex: 1, minWidth: 0 },
  groupName: { color: TEXT, fontSize: 13, fontWeight: "900" },
  groupCategory: { color: MUTED, fontSize: 10, marginTop: 3 },
  status: { fontSize: 9, fontWeight: "800", marginTop: 5 },
  statusActive: { color: "#16845D" },
  statusInactive: { color: "#D14343" },
  groupActions: { flexDirection: "row", gap: 3 },
  actionButton: {
    width: 30,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
});
