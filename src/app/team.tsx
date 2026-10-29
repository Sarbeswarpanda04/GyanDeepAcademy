
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import AppAlert, { type AppAlertType } from "../components/AppAlert";

const NAVY = "#1F2937";
const PURPLE = "#611CD0";
const PURPLE_DARK = "#44109D";
const PURPLE_BRIGHT = "#4C02F7";
const BG = "#F3F3FF";
const MUTED = "#718096";
const WHITE = "#FFFFFF";
const BORDER = "#E8E3F5";
const RED = "#C53E3E";
const WHATSAPP = "#168A4A";

type TeamMember = {
  id: string;
  recordId?: string;
  source: "membership" | "team";
  user_id: string;
  role: string;
  phone?: string | null;
  full_name?: string | null;
  status?: string;
  login_pin?: string | null;
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

      // profiles is the source of truth for account-holder identity. The profile
      // id matches auth.users.id, which is the user_id in institute_members.
      const memberUserIds = Array.from(
        new Set((instituteMembers ?? []).map((member: any) => member.user_id).filter(Boolean)),
      );
      const { data: profiles, error: profilesError } = memberUserIds.length
        ? await supabase
            .from("profiles")
            .select("id,full_name,mobile")
            .in("id", memberUserIds)
        : { data: [], error: null };

      if (profilesError) throw profilesError;

      const profileById = new Map(
        (profiles ?? []).map((profile: any) => [profile.id, profile]),
      );

      const mappedMembers: TeamMember[] = (instituteMembers ?? []).map(
        (member: any) => {
          const linkedStaff = (staff ?? []).find(
            (person: any) => person.created_by === member.user_id,
          );
          const profile = profileById.get(member.user_id);
          const isCurrentUser = member.user_id === user.id;
          const authMetadata = isCurrentUser ? (user.user_metadata ?? {}) : {};
          const authName =
            authMetadata.full_name ??
            authMetadata.name ??
            authMetadata.display_name ??
            null;
          const authPhone =
            user.phone ??
            authMetadata.phone ??
            authMetadata.mobile ??
            authMetadata.phone_number ??
            null;
          const isOwner = String(member.role ?? "").toLowerCase() === "owner";

          return {
            id: `membership-${member.id}`,
            source: "membership",
            user_id: member.user_id,
            role: member.role,
            // Never use a teacher/staff record for the owner card. The owner's
            // name and mobile come directly from public.profiles.
            full_name: isOwner
              ? (profile?.full_name || (isCurrentUser ? authName : null) || "Primary Owner")
              : (profile?.full_name || linkedStaff?.full_name || (isCurrentUser ? authName : null)),
            phone: isOwner
              ? (profile?.mobile || (isCurrentUser ? authPhone : null))
              : (profile?.mobile || linkedStaff?.phone || (isCurrentUser ? authPhone : null)),
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

      // Credentials are fetched through an authorized Edge Function; do not query
      // institute_team_credentials directly from the client.
      let pinByMemberId: Record<string, string> = {};
      const activeTeamIds = (teamRows ?? []).map((member: any) => member.id);
      if (activeTeamIds.length) {
        try {
          const { data: credentialData, error: credentialError } =
            await supabase.functions.invoke("get-team-member-credentials", {
              body: { institute_id: instituteId, member_ids: activeTeamIds },
            });
          if (credentialError) throw credentialError;
          const credentials = credentialData?.credentials ?? [];
          pinByMemberId = Object.fromEntries(
            credentials
              .filter((item: any) => item?.team_member_id && item?.login_pin)
              .map((item: any) => [
                String(item.team_member_id),
                String(item.login_pin),
              ]),
          );
        } catch (credentialError) {
          // Team management remains usable if the credential endpoint is not deployed.
          console.warn("Unable to load team login PINs:", credentialError);
        }
      }

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
          login_pin: pinByMemberId[String(member.id)] ?? null,
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
      <StatusBar barStyle="light-content" backgroundColor={PURPLE_DARK} />

      <LinearGradient
        colors={[PURPLE, PURPLE_DARK, PURPLE_BRIGHT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
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
          <Feather name="chevron-left" size={27} color={WHITE} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Team Management</Text>
          <Text style={styles.headerSubtitle}>Manage members and share login access</Text>
        </View>
        <View style={styles.headerIcon}>
          <Feather name="users" size={21} color={WHITE} />
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <View style={styles.skeletonList}>
            {[0, 1, 2].map((item) => (
              <View key={item} style={styles.skeletonCard}>
                <View style={styles.skeletonAvatar} />
                <View style={{ flex: 1, gap: 10 }}>
                  <View style={styles.skeletonLine} />
                  <View style={[styles.skeletonLine, { width: "62%" }]} />
                  <View style={[styles.skeletonLine, { width: "42%", height: 18 }]} />
                </View>
              </View>
            ))}
          </View>
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

  const shareLoginDetails = async () => {
    const rawPhone = (member.phone ?? "").replace(/\D/g, "");
    const phone =
      rawPhone.length === 10 ? `91${rawPhone}` :
      rawPhone.length === 12 && rawPhone.startsWith("91") ? rawPhone :
      rawPhone;
    if (!phone || phone.length < 10) {
      Alert.alert("Phone number required", "Add a valid phone number to share login details on WhatsApp.");
      return;
    }
    if (!member.login_pin) {
      Alert.alert(
        "Login PIN unavailable",
        "The PIN could not be loaded. Ensure the get-team-member-credentials Edge Function is deployed and returns this member's login PIN.",
      );
      return;
    }
    const message = [
  "🎓 GyanDeep Academy — Login Details",
  "",
  "📲 Download and install the GyanDeep Academy app:",
  "https://gyandeep.ac.sarbeswarpanda.in",
  "",
  "Please download and install the app before logging in.",
  "",
  "👤 LOGIN DETAILS",
  `Name: ${member.full_name || "Team member"}`,
  `Role: ${label}`,
  `Login phone: ${member.phone}`,
  `Login PIN: ${member.login_pin}`,
  "",
  "🔒 Please keep your login PIN private.",
  "",
  "Thank you,",
  "GyanDeep Academy",
].join("\n");

const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

try {
  await Linking.openURL(url);
} catch {
  Alert.alert(
    "Unable to open WhatsApp",
    "Please check that WhatsApp or a compatible app is available."
  );
}
  };

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
          {member.phone ? ` · ${member.phone}` : ""}
        </Text>

        <View style={styles.activePill}>
          <View style={styles.activeDot} />
          <Text style={styles.activeText}>
            {member.status === "inactive" ? "Inactive" : "Active"}
          </Text>
        </View>

        {isManagedTeamMember && (
          <>
            <View style={styles.pinBox}>
              <View style={styles.pinIcon}>
                <Feather name="key" size={15} color={PURPLE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pinLabel}>LOGIN PIN</Text>
                <Text style={styles.pinValue}>
                  {member.login_pin ?? "Unavailable"}
                </Text>
              </View>
              <Feather name="shield" size={16} color={PURPLE} />
            </View>
            <Pressable
              style={styles.whatsappButton}
              onPress={() => void shareLoginDetails()}
              accessibilityRole="button"
              accessibilityLabel={`Share login details with ${display} on WhatsApp`}
            >
              <Feather name="message-circle" size={17} color={WHITE} />
              <Text style={styles.whatsappText}>Share login details on WhatsApp</Text>
            </Pressable>
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
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  back: {
    width: 40, height: 40, borderRadius: 14,
    justifyContent: "center", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  headerIcon: {
    width: 42, height: 42, borderRadius: 14,
    justifyContent: "center", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  title: { fontSize: 22, fontWeight: "900", color: WHITE },
  headerSubtitle: { fontSize: 11, color: "#E9DFFF", marginTop: 4 },
  content: { padding: 16, paddingBottom: 140, gap: 14 },
  skeletonList: { gap: 14, marginTop: 6 },
  skeletonCard: {
    backgroundColor: WHITE, borderRadius: 22, padding: 18,
    flexDirection: "row", gap: 14, borderWidth: 1, borderColor: BORDER,
  },
  skeletonAvatar: { width: 54, height: 54, borderRadius: 18, backgroundColor: "#E9E3F8" },
  skeletonLine: { height: 12, borderRadius: 8, backgroundColor: "#EEEAF8", width: "82%" },
  memberCard: {
    backgroundColor: WHITE,
    borderRadius: 24,
    padding: 17,
    minHeight: 126,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 13,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: "#4C02F7",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 19,
    backgroundColor: "#EEE7FF",
    alignItems: "center",
    justifyContent: "center",
  },
  memberDetails: { flex: 1, minWidth: 0 },
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
  pinBox: {
    marginTop: 12,
    padding: 11,
    borderRadius: 14,
    backgroundColor: "#F7F4FF",
    borderWidth: 1,
    borderColor: "#E5DBFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pinIcon: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: "#E9DFFF", alignItems: "center", justifyContent: "center",
  },
  pinLabel: { color: MUTED, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  pinValue: { color: PURPLE_DARK, fontSize: 17, fontWeight: "900", marginTop: 2, letterSpacing: 1.5 },
  whatsappButton: {
    marginTop: 10,
    backgroundColor: WHATSAPP,
    borderRadius: 12,
    minHeight: 42,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  whatsappText: { color: WHITE, fontSize: 12, fontWeight: "800" },
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
    borderColor: BORDER,
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
    backgroundColor: PURPLE_DARK,
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
    borderWidth: 1,
    borderColor: BORDER,
  },
  muted: { color: MUTED, fontSize: 14 },
});
