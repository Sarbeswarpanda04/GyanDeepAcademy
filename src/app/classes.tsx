import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

const NAVY = "#26374D";
const BG = "#F1F5F8";
const MUTED = "#9DB1BE";
const ICON = "#536B83";
const BORDER = "#DCE5EC";
const RED = "#E53935";
const GREEN = "#27834B";
const WHITE = "#FFFFFF";

type ClassItem = {
  id: string;
  institute_id: string;
  name: string;
  default_fee_amount: number | null;
  default_fee_frequency: FeeFrequency;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
};

type FeeFrequency =
  | "monthly"
  | "quarterly"
  | "half_yearly"
  | "yearly"
  | "one_time";

const FEE_FREQUENCIES: { label: string; value: FeeFrequency }[] = [
  { label: "Monthly", value: "monthly" },
  { label: "Quarterly", value: "quarterly" },
  { label: "Half-yearly", value: "half_yearly" },
  { label: "Yearly", value: "yearly" },
  { label: "One-time", value: "one_time" },
];

type SheetMode = "create" | "edit" | null;
type ConfirmAction = "deactivate" | "delete" | null;

export default function ClassesScreen() {
  const insets = useSafeAreaInsets();

  const [instituteId, setInstituteId] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [className, setClassName] = useState("");
  const [defaultFee, setDefaultFee] = useState("");
  const [defaultFeeFrequency, setDefaultFeeFrequency] =
    useState<FeeFrequency>("monthly");
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);

  const [menuClass, setMenuClass] = useState<ClassItem | null>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 8, top: 8 });
  const menuAnchorsRef = useRef(new Map<string, View>());
  const [confirmAction, setConfirmAction] =
    useState<ConfirmAction>(null);
  const [confirmClass, setConfirmClass] = useState<ClassItem | null>(null);

  const activeClasses = classes.filter((item) => item.is_active);
  const displayedClasses = showInactive ? classes : activeClasses;

  function openClassMenu(item: ClassItem) {
    menuAnchorsRef.current
      .get(item.id)
      ?.measureInWindow((x, y, width, height) => {
        const menuWidth = 210;
        const menuHeight = 122;
        const window = Dimensions.get("window");
        const left = Math.max(
          8,
          Math.min(x + width - menuWidth, window.width - menuWidth - 8),
        );
        const belowTop = y + height + 4;
        const top =
          belowTop + menuHeight <= window.height - insets.bottom - 8
            ? belowTop
            : Math.max(insets.top + 8, y - menuHeight - 4);

        setMenuPosition({ left, top });
        setMenuClass(item);
      });
  }

  const loadClasses = useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: membership, error: membershipError } =
        await supabase
          .from("institute_members")
          .select("institute_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

      if (membershipError) throw membershipError;

      if (!membership) {
        setInstituteId(null);
        setClasses([]);
        return;
      }

      setInstituteId(membership.institute_id);

      const { data, error } = await supabase
        .from("institute_classes")
        .select(
          "id, institute_id, name, default_fee_amount, default_fee_frequency, is_active, created_at, updated_at",
        )
        .eq("institute_id", membership.institute_id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setClasses((data ?? []) as ClassItem[]);
    } catch (error) {
      console.error("Unable to load classes:", error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadClasses();
    }, [loadClasses])
  );

  function openCreateSheet() {
    setClassName("");
    setDefaultFee("");
    setDefaultFeeFrequency("monthly");
    setEditingClass(null);
    setSheetMode("create");
  }

  function openEditSheet(item: ClassItem) {
    setClassName(item.name);
    setDefaultFee(
      item.default_fee_amount == null ? "" : String(item.default_fee_amount),
    );
    setDefaultFeeFrequency(item.default_fee_frequency ?? "monthly");
    setEditingClass(item);
    setMenuClass(null);
    setSheetMode("edit");
  }

  function closeForm() {
    if (saving) return;
    Keyboard.dismiss();
    setSheetMode(null);
    setClassName("");
    setDefaultFee("");
    setEditingClass(null);
  }

  async function saveClass() {
    const name = className.trim();

    if (!name) {
      Alert.alert("Class name required", "Enter a class name to continue.");
      return;
    }

    if (name.length > 100) {
      Alert.alert("Name too long", "Class names can contain up to 100 characters.");
      return;
    }

    const feeText = defaultFee.trim();
    const feeAmount = feeText ? Number(feeText) : null;
    if (
      (sheetMode === "create" && feeAmount === null) ||
      (feeAmount !== null && (!Number.isFinite(feeAmount) || feeAmount < 0))
    ) {
      Alert.alert("Invalid default fee", "Enter a valid non-negative class fee.");
      return;
    }

    if (!instituteId) {
      Alert.alert("Institute not found", "Your account is not linked to an institute.");
      return;
    }

    setSaving(true);
    Keyboard.dismiss();

    try {
      if (sheetMode === "edit" && editingClass) {
        const { error } = await supabase
          .from("institute_classes")
          .update({
            name,
            default_fee_amount: feeAmount,
            default_fee_frequency: defaultFeeFrequency,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingClass.id)
          .eq("institute_id", instituteId);

        if (error) {
          if (error.code === "23505") {
            Alert.alert("Class already exists", "Choose a different class name.");
            return;
          }
          throw error;
        }
      } else {
        const { error } = await supabase
          .from("institute_classes")
          .insert({
            institute_id: instituteId,
            name,
            default_fee_amount: feeAmount,
            default_fee_frequency: defaultFeeFrequency,
          });

        if (error) {
          if (error.code === "23505") {
            Alert.alert("Class already exists", "Choose a different class name.");
            return;
          }
          throw error;
        }
      }

      setSheetMode(null);
      setClassName("");
      setDefaultFee("");
      setEditingClass(null);
      await loadClasses();
    } catch (error) {
      console.error("Unable to save class:", error);
      Alert.alert(
        "Could not save class",
        "Check your Supabase permissions and connection, then try again."
      );
    } finally {
      setSaving(false);
    }
  }

  function openConfirmation(action: ConfirmAction, item: ClassItem) {
    setMenuClass(null);
    setConfirmClass(item);
    setConfirmAction(action);
  }

  async function toggleClassStatus(item: ClassItem) {
    if (!instituteId) return;

    setMenuClass(null);
    setSaving(true);

    try {
      const { error } = await supabase
        .from("institute_classes")
        .update({
          is_active: !item.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("institute_id", instituteId);

      if (error) throw error;

      await loadClasses();
    } catch (error) {
      console.error("Unable to change class status:", error);
      Alert.alert("Action failed", "The class status could not be changed.");
    } finally {
      setSaving(false);
    }
  }

  async function executeConfirmedAction() {
    if (!confirmClass || !instituteId || !confirmAction) return;

    setSaving(true);

    try {
      if (confirmAction === "deactivate") {
        const { error } = await supabase
          .from("institute_classes")
          .update({
            is_active: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", confirmClass.id)
          .eq("institute_id", instituteId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("institute_classes")
          .delete()
          .eq("id", confirmClass.id)
          .eq("institute_id", instituteId);

        if (error) throw error;
      }

      setConfirmAction(null);
      setConfirmClass(null);
      await loadClasses();
    } catch (error) {
      console.error("Unable to complete class action:", error);
      Alert.alert(
        "Action failed",
        "The class could not be changed. Check your permissions and try again."
      );
    } finally {
      setSaving(false);
    }
  }

  function renderClass({ item }: { item: ClassItem }) {
    return (
      <View style={styles.classCard}>
        <TouchableOpacity
          style={styles.classMain}
          activeOpacity={0.75}
          onPress={() => {
            Alert.alert(
              item.name,
              "Student assignment to classes can be added next."
            );
          }}
        >
          <View style={styles.classIcon}>
            <Feather name="users" size={24} color={NAVY} />
          </View>

          <View style={styles.classText}>
            <Text style={styles.className} numberOfLines={2}>
              {item.name}
            </Text>

            {!item.is_active && (
              <Text style={styles.inactiveLabel}>Inactive</Text>
            )}
            {item.default_fee_amount != null && (
              <Text style={styles.classFee}>
                ₹{Number(item.default_fee_amount).toLocaleString("en-IN")} /{" "}
                {FEE_FREQUENCIES.find(
                  (frequency) =>
                    frequency.value === item.default_fee_frequency,
                )?.label ?? "Monthly"}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cardAction}
          accessibilityLabel={`Edit ${item.name}`}
          onPress={() => openEditSheet(item)}
        >
          <Feather name="edit-2" size={22} color={ICON} />
        </TouchableOpacity>

        <View
          ref={(node) => {
            if (node) {
              menuAnchorsRef.current.set(item.id, node);
            } else {
              menuAnchorsRef.current.delete(item.id);
            }
          }}
          collapsable={false}
          style={styles.cardAction}
        >
          <TouchableOpacity
            style={styles.cardActionButton}
            accessibilityLabel={`More actions for ${item.name}`}
            onPress={() => openClassMenu(item)}
          >
            <Feather name="more-vertical" size={25} color={ICON} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={WHITE}
        translucent={false}
      />

      {/* Compact page header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          accessibilityLabel="Go back"
          onPress={() => router.back()}
        >
          <Feather name="chevron-left" size={29} color={NAVY} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Classes</Text>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setShowInactive((value) => !value)}
        >
          <Text style={styles.headerCount}>
            {showInactive
              ? `${classes.length} total`
              : `${activeClasses.length} active`}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={NAVY} />
            <Text style={styles.stateSubtitle}>Loading classes...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.centerState}>
            <Feather name="wifi-off" size={38} color={MUTED} />
            <Text style={styles.emptyTitle}>Couldn't load classes</Text>
            <Text style={styles.stateSubtitle}>
              Check your connection and try again.
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => void loadClasses()}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : !instituteId ? (
          <View style={styles.centerState}>
            <Feather name="home" size={42} color={MUTED} />
            <Text style={styles.emptyTitle}>No institute linked</Text>
            <Text style={styles.stateSubtitle}>
              Set up or join an institute before creating classes.
            </Text>
          </View>
        ) : displayedClasses.length === 0 ? (
          <View style={styles.centerState}>
            <View style={styles.emptyIcon}>
              <Feather name="users" size={32} color={ICON} />
            </View>

            <Text style={styles.emptyTitle}>No classes yet</Text>

            <Text style={styles.emptyDescription}>
              Create a class to group students (e.g. Class 10),
              separate from batches.
            </Text>

            {!showInactive && (
              <TouchableOpacity
                style={styles.createEmptyButton}
                onPress={openCreateSheet}
                activeOpacity={0.85}
              >
                <Text style={styles.createEmptyText}>Create class</Text>
              </TouchableOpacity>
            )}

            {showInactive && (
              <TouchableOpacity
                style={styles.createEmptyButton}
                onPress={() => setShowInactive(false)}
              >
                <Text style={styles.createEmptyText}>Show active classes</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlatList
            data={displayedClasses}
            keyExtractor={(item) => item.id}
            renderItem={renderClass}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: Math.max(insets.bottom, 12) + 90 },
            ]}
            showsVerticalScrollIndicator={false}
          />
        )}

        {!loading && !loadError && instituteId && displayedClasses.length > 0 && (
          <TouchableOpacity
            style={[
              styles.floatingButton,
              { bottom: Math.max(insets.bottom, 12) + 10 },
            ]}
            onPress={openCreateSheet}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={24} color={WHITE} />
            <Text style={styles.floatingButtonText}>New class</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Create and edit bottom sheet */}
      <Modal
        visible={sheetMode !== null}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeForm}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <Pressable
            style={styles.scrim}
            onPress={() => Keyboard.dismiss()}
          />

          <View
            style={[
              styles.formSheet,
              {
                paddingBottom: Math.max(insets.bottom, 12) + 12,
                maxHeight: "85%",
              },
            ]}
          >
            <View style={styles.sheetHandle} />

            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.formScrollContent}
            >
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>
                  {sheetMode === "edit" ? "Edit class" : "New class"}
                </Text>

                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={closeForm}
                  disabled={saving}
                  accessibilityLabel="Close form"
                >
                  <Feather name="x" size={22} color={NAVY} />
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>
                Class name <Text style={styles.required}>*</Text>
              </Text>

              <TextInput
                value={className}
                onChangeText={setClassName}
                placeholder="e.g. Class 10"
                placeholderTextColor="#A0A9B5"
                style={styles.input}
                autoFocus
                maxLength={100}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                editable={!saving}
                accessibilityLabel="Class name"
              />

              <Text style={[styles.inputLabel, styles.feeLabel]}>
                Default fee{sheetMode === "create" ? " *" : ""}
              </Text>
              <TextInput
                value={defaultFee}
                onChangeText={(value) =>
                  setDefaultFee(value.replace(/[^\d.]/g, ""))
                }
                placeholder="e.g. 500"
                placeholderTextColor="#A0A9B5"
                style={styles.input}
                keyboardType="decimal-pad"
                editable={!saving}
                accessibilityLabel="Default class fee"
              />

              <Text style={[styles.inputLabel, styles.feeLabel]}>
                Billing frequency
              </Text>
              <View style={styles.feeFrequencyOptions}>
                {FEE_FREQUENCIES.map((frequency) => (
                  <TouchableOpacity
                    key={frequency.value}
                    style={[
                      styles.feeFrequencyOption,
                      defaultFeeFrequency === frequency.value &&
                        styles.feeFrequencyOptionActive,
                    ]}
                    onPress={() =>
                      setDefaultFeeFrequency(frequency.value)
                    }
                    disabled={saving}
                  >
                    <Text
                      style={[
                        styles.feeFrequencyText,
                        defaultFeeFrequency === frequency.value &&
                          styles.feeFrequencyTextActive,
                      ]}
                    >
                      {frequency.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  (!className.trim() ||
                    (sheetMode === "create" && !defaultFee.trim()) ||
                    saving) &&
                    styles.submitDisabled,
                ]}
                onPress={() => void saveClass()}
                disabled={
                  !className.trim() ||
                  (sheetMode === "create" && !defaultFee.trim()) ||
                  saving
                }
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color={WHITE} />
                ) : (
                  <Text style={styles.submitText}>
                    {sheetMode === "edit" ? "Save changes" : "Create class"}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Three-dot menu */}
      <Modal
        visible={menuClass !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setMenuClass(null)}
      >
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setMenuClass(null)}
        >
          <View
            style={[
              styles.menuCard,
              { left: menuPosition.left, top: menuPosition.top },
            ]}
          >
            {menuClass?.is_active ? (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() =>
                  menuClass && openConfirmation("deactivate", menuClass)
                }
              >
                <Feather name="slash" size={21} color={ICON} />
                <Text style={styles.menuText}>Deactivate</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => menuClass && void toggleClassStatus(menuClass)}
              >
                <Feather name="check-circle" size={21} color={GREEN} />
                <Text style={styles.menuText}>Activate</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() =>
                menuClass && openConfirmation("delete", menuClass)
              }
            >
              <Feather name="trash-2" size={21} color={RED} />
              <Text style={[styles.menuText, styles.deleteMenuText]}>
                Delete
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Deactivate / delete confirmation sheet */}
      <Modal
        visible={confirmAction !== null}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => {
          if (!saving) {
            setConfirmAction(null);
            setConfirmClass(null);
          }
        }}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.scrim}
            onPress={() => {
              if (!saving) {
                setConfirmAction(null);
                setConfirmClass(null);
              }
            }}
          />

          <View
            style={[
              styles.confirmSheet,
              { paddingBottom: Math.max(insets.bottom, 16) + 16 },
            ]}
          >
            <TouchableOpacity
              style={styles.confirmClose}
              onPress={() => {
                if (saving) return;
                setConfirmAction(null);
                setConfirmClass(null);
              }}
              disabled={saving}
              accessibilityLabel="Close confirmation"
            >
              <Feather name="x" size={23} color={WHITE} />
            </TouchableOpacity>

            <View style={styles.confirmContent}>
              <View style={styles.deleteIcon}>
                <Feather
                  name={confirmAction === "delete" ? "trash-2" : "slash"}
                  size={33}
                  color={RED}
                />
              </View>

              <Text style={styles.confirmTitle}>
                {confirmAction === "delete"
                  ? `Delete ${confirmClass?.name ?? "class"}?`
                  : "Deactivate class?"}
              </Text>

              <Text style={styles.confirmDescription}>
                {confirmAction === "delete"
                  ? `“${confirmClass?.name ?? "This class"}” will be permanently removed from the class list. This can't be undone.`
                  : `“${confirmClass?.name ?? "This class"}” won't appear when adding students or in active class filters. You can activate it again later.`}
              </Text>
            </View>

            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  if (saving) return;
                  setConfirmAction(null);
                  setConfirmClass(null);
                }}
                disabled={saving}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => void executeConfirmedAction()}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={WHITE} />
                ) : (
                  <Text style={styles.deleteText}>
                    {confirmAction === "delete" ? "Delete" : "Deactivate"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    backgroundColor: WHITE,
    minHeight: 68,
    paddingTop: 35,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E6ECF1",
    gap: 10,
  },
  backButton: {
    width: 32,
    height: 42,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: NAVY,
    fontSize: 23,
    fontWeight: "800",
  },
  headerCount: {
    color: MUTED,
    fontSize: 13,
    fontWeight: "600",
  },
  body: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 100,
    gap: 12,
  },
  classCard: {
    minHeight: 86,
    backgroundColor: WHITE,
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
  },
  classMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  classIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#DEE7EE",
    alignItems: "center",
    justifyContent: "center",
  },
  classText: {
    flex: 1,
    minWidth: 0,
  },
  className: {
    color: NAVY,
    fontSize: 17,
    fontWeight: "800",
  },
  classFee: {
    color: GREEN,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 5,
  },
  inactiveLabel: {
    color: MUTED,
    fontSize: 11,
    marginTop: 4,
  },
  cardAction: {
    width: 36,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  cardActionButton: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingBottom: 35,
  },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: "#EBF0F5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  emptyTitle: {
    color: NAVY,
    fontSize: 21,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyDescription: {
    color: MUTED,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 9,
  },
  stateSubtitle: {
    color: MUTED,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 10,
  },
  createEmptyButton: {
    marginTop: 30,
    backgroundColor: NAVY,
    borderRadius: 14,
    minHeight: 54,
    minWidth: 205,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  createEmptyText: {
    color: WHITE,
    fontSize: 18,
    fontWeight: "600",
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: NAVY,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: {
    color: WHITE,
    fontSize: 15,
    fontWeight: "700",
  },
  floatingButton: {
    position: "absolute",
    right: 16,
    minHeight: 54,
    borderRadius: 27,
    backgroundColor: "#202D3F",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 19,
    gap: 9,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
  },
  floatingButtonText: {
    color: WHITE,
    fontSize: 15,
    fontWeight: "800",
  },

  // Bottom sheet and keyboard-safe form
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(17, 27, 40, 0.38)",
  },
  formSheet: {
    backgroundColor: WHITE,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingHorizontal: 18,
    paddingTop: 10,
    overflow: "hidden",
  },
  formScrollContent: {
    paddingBottom: 8,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D9E1E8",
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },
  sheetTitle: {
    color: NAVY,
    fontSize: 23,
    fontWeight: "800",
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F0F3F6",
    alignItems: "center",
    justifyContent: "center",
  },
  inputLabel: {
    color: "#151B23",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 9,
  },
  required: {
    color: RED,
  },
  input: {
    height: 56,
    borderWidth: 1.5,
    borderColor: NAVY,
    borderRadius: 13,
    paddingHorizontal: 14,
    color: NAVY,
    fontSize: 16,
  },
  feeLabel: {
    marginTop: 18,
  },
  feeFrequencyOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  feeFrequencyOption: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  feeFrequencyOptionActive: {
    backgroundColor: NAVY,
    borderColor: NAVY,
  },
  feeFrequencyText: {
    color: ICON,
    fontSize: 12,
    fontWeight: "600",
  },
  feeFrequencyTextActive: {
    color: WHITE,
  },
  submitButton: {
    minHeight: 54,
    backgroundColor: NAVY,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  submitDisabled: {
    backgroundColor: "#CFD4DA",
  },
  submitText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "700",
  },

  // Three-dot action menu
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 27, 40, 0.08)",
  },
  menuCard: {
    position: "absolute",
    width: 210,
    backgroundColor: WHITE,
    borderRadius: 13,
    paddingVertical: 7,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
  },
  menuItem: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    paddingHorizontal: 17,
  },
  menuText: {
    color: NAVY,
    fontSize: 15,
    fontWeight: "500",
  },
  deleteMenuText: {
    color: RED,
  },

  // Confirmation sheet
  confirmSheet: {
    backgroundColor: WHITE,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingHorizontal: 18,
    paddingTop: 22,
  },
  confirmClose: {
    position: "absolute",
    top: -57,
    alignSelf: "center",
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#6D788A",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmContent: {
    alignItems: "center",
    paddingTop: 20,
  },
  deleteIcon: {
    width: 82,
    height: 82,
    borderRadius: 25,
    backgroundColor: "#FBE5E5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 21,
  },
  confirmTitle: {
    color: NAVY,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  confirmDescription: {
    color: NAVY,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 11,
    marginBottom: 24,
  },
  confirmButtons: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    minHeight: 54,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    color: NAVY,
    fontSize: 15,
    fontWeight: "800",
  },
  deleteButton: {
    flex: 1,
    minHeight: 54,
    backgroundColor: RED,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteText: {
    color: WHITE,
    fontSize: 15,
    fontWeight: "800",
  },
});
