import AsyncStorage from "@react-native-async-storage/async-storage";

export type StudentIdCardSettings = {
  template: "vertical" | "horizontal";
  showFatherName: boolean;
  showBloodGroup: boolean;
  showAddress: boolean;
  showDateOfBirth: boolean;
  showGender: boolean;
  showAdmissionDate: boolean;
};

export const DEFAULT_STUDENT_ID_CARD_SETTINGS: StudentIdCardSettings = {
  template: "vertical",
  showFatherName: true,
  showBloodGroup: true,
  showAddress: true,
  showDateOfBirth: true,
  showGender: true,
  showAdmissionDate: true,
};

const storageKey = (instituteId: string) =>
  `student-id-card-settings:${instituteId}`;

export async function loadStudentIdCardSettings(
  instituteId: string,
): Promise<StudentIdCardSettings> {
  const stored = await AsyncStorage.getItem(storageKey(instituteId));
  if (!stored) return DEFAULT_STUDENT_ID_CARD_SETTINGS;

  const parsed: unknown = JSON.parse(stored);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Saved ID card settings are invalid.");
  }

  const saved = parsed as Partial<StudentIdCardSettings>;
  return {
    ...DEFAULT_STUDENT_ID_CARD_SETTINGS,
    showFatherName: saved.showFatherName ?? true,
    showBloodGroup: saved.showBloodGroup ?? true,
    showAddress: saved.showAddress ?? true,
    showDateOfBirth: saved.showDateOfBirth ?? true,
    showGender: saved.showGender ?? true,
    showAdmissionDate: saved.showAdmissionDate ?? true,
    template:
      saved.template === "horizontal" || saved.template === "vertical"
        ? saved.template
        : DEFAULT_STUDENT_ID_CARD_SETTINGS.template,
  };
}

export async function saveStudentIdCardSettings(
  instituteId: string,
  settings: StudentIdCardSettings,
) {
  await AsyncStorage.setItem(storageKey(instituteId), JSON.stringify(settings));
}
