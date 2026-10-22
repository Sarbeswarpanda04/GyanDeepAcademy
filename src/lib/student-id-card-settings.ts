import AsyncStorage from "@react-native-async-storage/async-storage";

export type StudentIdCardSettings = {
  template: "vertical" | "horizontal";
  showFatherName: boolean;
  showBloodGroup: boolean;
  showAddress: boolean;
  showDateOfBirth: boolean;
  showGender: boolean;
  showClass: boolean;
  useCourseLabel: boolean;
  showAdmissionDate: boolean;
  showSeatNumber: boolean;
};

export const DEFAULT_STUDENT_ID_CARD_SETTINGS: StudentIdCardSettings = {
  template: "vertical",
  showFatherName: true,
  showBloodGroup: true,
  showAddress: true,
  showDateOfBirth: true,
  showGender: true,
  showClass: true,
  useCourseLabel: true,
  showAdmissionDate: true,
  showSeatNumber: true,
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

  return {
    ...DEFAULT_STUDENT_ID_CARD_SETTINGS,
    ...parsed,
  } as StudentIdCardSettings;
}

export async function saveStudentIdCardSettings(
  instituteId: string,
  settings: StudentIdCardSettings,
) {
  await AsyncStorage.setItem(storageKey(instituteId), JSON.stringify(settings));
}
