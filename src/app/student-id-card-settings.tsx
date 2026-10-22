import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import {
  DEFAULT_STUDENT_ID_CARD_SETTINGS,
  loadStudentIdCardSettings,
  saveStudentIdCardSettings,
  type StudentIdCardSettings,
} from "../lib/student-id-card-settings";

const navy = "#243448";
const background = "#F1F5F8";

type BooleanSettingKey = {
  [Key in keyof StudentIdCardSettings]: StudentIdCardSettings[Key] extends boolean
    ? Key
    : never;
}[keyof StudentIdCardSettings];

const fieldOptions: {
  key: BooleanSettingKey;
  label: string;
}[] = [
  { key: "showFatherName", label: "Father's name" },
  { key: "showBloodGroup", label: "Blood group" },
  { key: "showAddress", label: "Address" },
  { key: "showDateOfBirth", label: "Date of birth" },
  { key: "showGender", label: "Gender" },
  { key: "showClass", label: "Class" },
  { key: "useCourseLabel", label: 'Label class as "Course"' },
  { key: "showAdmissionDate", label: "Admission date" },
  { key: "showSeatNumber", label: "Seat number" },
];

function TemplatePreview({ horizontal }: { horizontal: boolean }) {
  return (
    <View
      style={[
        styles.templateCanvas,
        horizontal && styles.templateCanvasHorizontal,
      ]}
    >
      <View
        style={[
          styles.templateCard,
          horizontal && styles.templateCardHorizontal,
        ]}
      >
        <View
          style={[
            styles.templateTop,
            horizontal && styles.templateTopHorizontal,
          ]}
        />
        <View
          style={[
            styles.templatePhoto,
            horizontal && styles.templatePhotoHorizontal,
          ]}
        />
        <View style={styles.templateLines}>
          <View style={styles.templateLine} />
          <View style={[styles.templateLine, styles.templateLineShort]} />
          {horizontal && <View style={styles.templateLineShort} />}
        </View>
        <View
          style={[
            styles.templateBottom,
            horizontal && styles.templateBottomHorizontal,
          ]}
        />
      </View>
    </View>
  );
}

export default function StudentIdCardSettingsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ instituteId?: string }>();
  const passedInstituteId = Array.isArray(params.instituteId)
    ? params.instituteId[0]
    : params.instituteId;
  const [instituteId, setInstituteId] = useState(passedInstituteId ?? "");
  const [settings, setSettings] = useState<StudentIdCardSettings>(
    DEFAULT_STUDENT_ID_CARD_SETTINGS,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        let currentInstituteId = passedInstituteId;
        if (!currentInstituteId) {
          const {
            data: { user },
            error: authError,
          } = await supabase.auth.getUser();
          if (authError) throw authError;
          if (!user) throw new Error("Please sign in to edit ID card settings.");

          const { data: membership, error: membershipError } = await supabase
            .from("institute_members")
            .select("institute_id")
            .eq("user_id", user.id)
            .limit(1)
            .maybeSingle();
          if (membershipError) throw membershipError;
          if (!membership) {
            throw new Error("Your account is not linked to an institute.");
          }
          currentInstituteId = membership.institute_id;
        }

        const savedSettings =
          await loadStudentIdCardSettings(currentInstituteId);
        if (!mounted) return;
        setInstituteId(currentInstituteId);
        setSettings(savedSettings);
      } catch (error) {
        if (mounted) {
          Alert.alert(
            "Unable to load settings",
            error instanceof Error ? error.message : "Please try again.",
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [passedInstituteId]);

  const update = <K extends keyof StudentIdCardSettings>(
    key: K,
    value: StudentIdCardSettings[K],
  ) => setSettings((current) => ({ ...current, [key]: value }));

  async function save() {
    if (!instituteId) {
      Alert.alert("Institute unavailable", "Could not find your institute.");
      return;
    }

    setSaving(true);
    try {
      await saveStudentIdCardSettings(instituteId, settings);
      router.back();
    } catch (error) {
      Alert.alert(
        "Unable to save settings",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={28} color={navy} />
        </Pressable>
        <Text style={styles.headerTitle}>ID card settings</Text>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={navy} />
          <Text style={styles.helper}>Loading your ID card settings...</Text>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: Math.max(insets.bottom, 16) + 90 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionTitle}>Template</Text>
            <View style={styles.templates}>
              {(["vertical", "horizontal"] as const).map((template) => {
                const selected = settings.template === template;
                const horizontal = template === "horizontal";
                return (
                  <Pressable
                    key={template}
                    style={[
                      styles.templateOption,
                      selected && styles.templateSelected,
                    ]}
                    onPress={() => update("template", template)}
                  >
                    <TemplatePreview horizontal={horizontal} />
                    <View style={styles.templateLabelRow}>
                      <View>
                        <Text style={styles.templateTitle}>
                          {horizontal ? "Horizontal" : "Vertical"}
                        </Text>
                        <Text style={styles.templateSubtitle}>
                          {horizontal ? "Landscape" : "Default"}
                        </Text>
                      </View>
                      {selected && (
                        <Feather
                          name="check-circle"
                          size={24}
                          color={navy}
                        />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.sectionTitle, styles.fieldsHeading]}>
              Fields
            </Text>
            <Text style={styles.description}>
              Choose which optional details print on every student&apos;s ID card.
              Name, phone, roll number, and batch are always shown.
            </Text>
            <View style={styles.fieldsCard}>
              {fieldOptions.map((field, index) => {
                return (
                  <View
                    key={field.key}
                    style={[
                      styles.fieldRow,
                      index === fieldOptions.length - 1 &&
                        styles.fieldRowLast,
                    ]}
                  >
                    <Text style={styles.fieldLabel}>{field.label}</Text>
                    <Switch
                      value={settings[field.key]}
                      onValueChange={(value) => update(field.key, value)}
                      trackColor={{ false: "#D7E0E7", true: navy }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                );
              })}
            </View>

          </ScrollView>
          <Pressable
            style={[
              styles.saveButton,
              { bottom: Math.max(insets.bottom, 14) },
            ]}
            onPress={() => void save()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveText}>Save settings</Text>
            )}
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: background },
  header: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E4EAF0",
  },
  backButton: { width: 36, height: 42, justifyContent: "center" },
  headerTitle: { color: navy, fontSize: 22, fontWeight: "800" },
  content: { padding: 20 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  sectionTitle: { color: navy, fontSize: 19, fontWeight: "800" },
  templates: { flexDirection: "row", gap: 12, marginTop: 14 },
  templateOption: {
    flex: 1,
    padding: 12,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: "#DCE5EC",
    backgroundColor: "#FFFFFF",
  },
  templateSelected: { borderWidth: 3, borderColor: navy, padding: 10.5 },
  templateCanvas: {
    height: 160,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F8",
    borderRadius: 17,
  },
  templateCanvasHorizontal: { height: 160 },
  templateCard: {
    width: 74,
    height: 136,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#AAB8C3",
    borderRadius: 9,
    alignItems: "center",
    overflow: "hidden",
  },
  templateCardHorizontal: { width: 166, height: 104 },
  templateTop: {
    height: 22,
    width: "100%",
    backgroundColor: navy,
  },
  templateTopHorizontal: { height: 18 },
  templatePhoto: {
    width: 29,
    height: 34,
    borderRadius: 7,
    backgroundColor: "#9EB4C0",
    marginTop: 10,
  },
  templatePhotoHorizontal: {
    position: "absolute",
    left: 10,
    top: 24,
    width: 30,
    height: 38,
    marginTop: 0,
  },
  templateLines: { alignItems: "center", gap: 4, marginTop: 8 },
  templateLine: {
    width: 48,
    height: 5,
    borderRadius: 4,
    backgroundColor: "#DCE5EC",
  },
  templateLineShort: {
    width: 32,
    height: 5,
    borderRadius: 4,
    backgroundColor: "#DCE5EC",
  },
  templateBottom: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    height: 16,
    backgroundColor: navy,
  },
  templateBottomHorizontal: { height: 12 },
  templateLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 11,
  },
  templateTitle: { color: navy, fontSize: 16, fontWeight: "800" },
  templateSubtitle: { color: "#637B90", fontSize: 12, marginTop: 2 },
  fieldsHeading: { marginTop: 30 },
  description: {
    color: "#60788D",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
    marginBottom: 14,
  },
  fieldsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    overflow: "hidden",
  },
  fieldRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 17,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E6ECF1",
  },
  fieldRowLast: { borderBottomWidth: 0 },
  fieldLabel: {
    flex: 1,
    color: navy,
    fontSize: 15,
    fontWeight: "700",
    paddingRight: 8,
  },
  saveButton: {
    position: "absolute",
    left: 20,
    right: 20,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: navy,
    elevation: 5,
  },
  saveText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  helper: { color: "#718397", fontSize: 13 },
});
