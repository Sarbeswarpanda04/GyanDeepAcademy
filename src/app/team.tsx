
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import AppAlert, { type AppAlertType } from "../components/AppAlert";

const NAVY = "#202F42";
const BG = "#F1F5F8";
const MUTED = "#9DB1BE";
const WHITE = "#FFFFFF";
const RED = "#C53E3E";

type TeamMember = {
  id: string;
  recordId?: string;
  source: "membership" | "team";
  user_id: string;
  role: string;
  phone?: string | null;
  full_name?: string | null;
  status?: string;
};

type AlertState = {
  visible: boolean;
  title: string;
  message: string;
  type: AppAlertType;
};

export default function TeamScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [alert, setAlert] = useState<AlertState>({
    visible: false,
    title: "",
    message: "",
    type: "info",
  });

  const showAlert = (
    title: string,
    message: string,
    type: AppAlertType = "error",
  ) => setAlert({ visible: true, title, message, type });

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

      const { data: memberships, error: membershipError } = await supabase
        .from("institute_members")
        .select("institute_id,role")
        .eq("user_id", user.id)
        .limit(2);

      if (membershipError) throw membershipError;

      if (!memberships?.length) {
        throw new Error("Your account is not linked to an institute.");
      }

      if (memberships.length > 1) {
        throw new Error(
          "Select an active institute before managing the team.",
        );
      }

      const instituteId = memberships[0].institute_id;

      const { data: instituteMembers, error: membersError } = await supabase
        .from("institute_members")
        .select("id,user_id,role")
        .eq("institute_id", instituteId);

      if (membersError) throw membersError;

      const { data: staff, error: staffError } = await supabase
        .from("institute_staff")
        .select("id,full_name,phone,created_by")
        .eq("institute_id", instituteId);

      if (staffError) throw staffError;

      const mappedMembers: TeamMember[] = (instituteMembers ?? []).map(
        (member: any) => {
          const linkedStaff = (staff ?? []).find(
            (person: any) => person.created_by === member.user_id,
          );

          return {
            id: `membership-${member.id}`,
            source: "membership",
            user_id: member.user_id,
            role: member.role,
            full_name: linkedStaff?.full_name ?? null,
            phone: linkedStaff?.phone ?? null,
            status: "active",
          };
        },
      );

      const { data: teamRows, error: teamError } = await supabase
        .from("institute_team_members")
        .select("id,role,full_name,phone,is_active,created_at")
        .eq("institute_id", instituteId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      if (teamError) throw teamError;

      const teamCards: TeamMember[] = (teamRows ?? []).map(
        (member: any) => ({
          id: `team-${member.id}`,
          recordId: member.id,
          source: "team",
          user_id: "",
          role: member.role,
          full_name: member.full_name,
          phone: member.phone,
          status: member.is_active ? "active" : "inactive",
        }),
      );

      // Avoid showing the same person twice if present in both tables.
      const all = [...mappedMembers, ...teamCards];
      const seen = new Set<string>();

      const unique = all.filter((member) => {
        const key = `${member.role.toLowerCase()}-${
          (member.phone ?? "").replace(/\D/g, "") || member.user_id
        }`;

        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setMembers(unique);
    } catch (error: any) {
      showAlert(
        "Unable to load team",
        error?.message ?? "Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const roleLabel = (role: string) => {
    switch (role?.toLowerCase()) {
      case "owner":
        return "Institute admin · Primary owner";
      case "manager":
        return "Manager";
      case "teacher":
        return "Teacher";
      default:
        return role || "Team member";
    }
  };

  const editMember = (member: TeamMember) => {
    if (member.source !== "team" || !member.recordId) return;

    router.push({
      pathname: "/add-team-member",
      params: {
        mode: "edit",
        memberId: member.recordId,
      },
    } as never);
  };

  const deleteMember = (member: TeamMember) => {
    if (member.source !== "team" || !member.recordId) return;

    Alert.alert(
      "Remove team member?",
      `This will deactivate ${member.full_name || member.phone || "this member"}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: () => {
            void deactivateMember(member);
          },
        },
      ],
    );
  };

  const deactivateMember = async (member: TeamMember) => {
    if (!member.recordId || deletingId) return;

    setDeletingId(member.recordId);

    try {
      // This updates the database record; RLS must permit the authorized
      // owner/manager to perform this action.
      const { error } = await supabase
        .from("institute_team_members")
        .update({ is_active: false })
        .eq("id", member.recordId);

      if (error) throw error;

      setMembers((current) =>
        current.filter((item) => item.recordId !== member.recordId),
      );

      showAlert(
        "Member deactivated",
        `${member.full_name || "The member"} has been deactivated.`,
        "success",
      );
    } catch (error: any) {
      showAlert(
        "Unable to deactivate member",
        error?.message ??
          "The member could not be deactivated. Check your RLS policies.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const primary = members.find(
    (member) => member.role?.toLowerCase() === "owner",
  );

  const others = members.filter((member) => member.id !== primary?.id);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={WHITE} />

      <View
        style={[
          styles.header,
          { paddingTop: Math.max(insets.top, 12) + 12 },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={29} color={NAVY} />
        </Pressable>

        <Text style={styles.title}>Team</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator
            color={NAVY}
            size="large"
            style={{ marginTop: 32 }}
          />
        ) : (
          <>
            {primary ? (
              <MemberCard
                member={primary}
                label="Primary owner"
                onEdit={editMember}
                onDelete={deleteMember}
                deleting={deletingId === primary.recordId}
              />
            ) : (
              <View style={styles.empty}>
                <Text style={styles.muted}>
                  Owner details are not available.
                </Text>
              </View>
            )}

            {others.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                label={roleLabel(member.role)}
                onEdit={editMember}
                onDelete={deleteMember}
                deleting={deletingId === member.recordId}
              />
            ))}

            {!members.length && (
              <View style={styles.empty}>
                <Text style={styles.muted}>No team members found.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Pressable
        style={[
          styles.addButton,
          { bottom: Math.max(insets.bottom, 20) + 18 },
        ]}
        onPress={() => router.push("/add-team-member" as never)}
        accessibilityRole="button"
      >
        <Feather name="plus" size={26} color={WHITE} />
        <Text style={styles.addText}>Add member</Text>
      </Pressable>

      <AppAlert
        visible={alert.visible}
        title={alert.title}
        message={alert.message}
        type={alert.type}
        confirmLabel="OK"
        onConfirm={() =>
          setAlert((current) => ({ ...current, visible: false }))
        }
      />
    </View>
  );
}

function MemberCard({
  member,
  label,
  onEdit,
  onDelete,
  deleting,
}: {
  member: TeamMember;
  label: string;
  onEdit: (member: TeamMember) => void;
  onDelete: (member: TeamMember) => void;
  deleting: boolean;
}) {
  const display =
    member.full_name || member.phone || member.user_id || "Team member";

  const isManagedTeamMember =
    member.source === "team" && Boolean(member.recordId);

  return (
    <View style={styles.memberCard}>
      <View style={styles.avatar}>
        <Feather
          name={label === "Primary owner" ? "user-check" : "users"}
          size={27}
          color={NAVY}
        />
      </View>

      <View style={styles.memberDetails}>
        <Text style={styles.memberName} numberOfLines={1}>
          {display}
        </Text>

        <Text style={styles.memberSub} numberOfLines={2}>
          {label}
          {member.phone && display !== member.phone ? ` · ${member.phone}` : ""}
        </Text>

        <View style={styles.activePill}>
          <View style={styles.activeDot} />
          <Text style={styles.activeText}>
            {member.status === "inactive" ? "Inactive" : "Active"}
          </Text>
        </View>

        {isManagedTeamMember && (
          <View style={styles.actions}>
            <Pressable
              style={styles.editButton}
              onPress={() => onEdit(member)}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${display}`}
            >
              <Feather name="edit-2" size={15} color={NAVY} />
              <Text style={styles.editText}>Edit</Text>
            </Pressable>

            <Pressable
              style={styles.deleteButton}
              onPress={() => onDelete(member)}
              disabled={deleting}
              accessibilityRole="button"
              accessibilityLabel={`Deactivate ${display}`}
            >
              {deleting ? (
                <ActivityIndicator size="small" color={RED} />
              ) : (
                <>
                  <Feather name="trash-2" size={15} color={RED} />
                  <Text style={styles.deleteText}>Delete</Text>
                </>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: WHITE,
    paddingHorizontal: 22,
    paddingBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E8EDF2",
  },
  back: { width: 34, height: 38, justifyContent: "center" },
  title: { fontSize: 27, fontWeight: "900", color: NAVY },
  content: { padding: 18, paddingBottom: 140, gap: 14 },
  memberCard: {
    backgroundColor: WHITE,
    borderRadius: 24,
    padding: 18,
    minHeight: 126,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 19,
    backgroundColor: "#EEF2F7",
    alignItems: "center",
    justifyContent: "center",
  },
  memberDetails: { flex: 1 },
  memberName: { fontSize: 18, fontWeight: "900", color: NAVY },
  memberSub: {
    fontSize: 13,
    color: MUTED,
    fontWeight: "600",
    marginTop: 5,
  },
  activePill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    backgroundColor: "#EAF6EC",
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginTop: 8,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#43814A",
  },
  activeText: { color: "#43814A", fontSize: 11, fontWeight: "800" },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#DCE5EC",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  editText: { color: NAVY, fontSize: 13, fontWeight: "800" },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#F0D7D7",
    backgroundColor: "#FFF7F7",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  deleteText: { color: RED, fontSize: 13, fontWeight: "800" },
  addButton: {
    position: "absolute",
    right: 22,
    backgroundColor: NAVY,
    borderRadius: 30,
    paddingHorizontal: 23,
    paddingVertical: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    elevation: 4,
  },
  addText: { fontSize: 17, fontWeight: "800", color: WHITE },
  empty: {
    backgroundColor: WHITE,
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
  },
  muted: { color: MUTED, fontSize: 15 },
});
