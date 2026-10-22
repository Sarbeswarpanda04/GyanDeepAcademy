import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Modal,
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
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase";

type ClassRow = {
  id: string;
  name: string;
  default_fee_amount: number | null;
  default_fee_frequency: Frequency;
};
type SubjectRow = { id: string; name: string; class_id: string };
type BatchRow = { id: string; name: string; class_id?: string | null };
type Frequency =
  | "monthly"
  | "quarterly"
  | "half_yearly"
  | "yearly"
  | "one_time";

type Stage =
  | "checking authentication"
  | "checking membership"
  | "validating class"
  | "validating subjects"
  | "validating batches"
  | "creating student"
  | "updating student"
  | "uploading photo"
  | "saving photo path"
  | "saving subjects"
  | "saving batches"
  | "saving fee"
  | "removing subjects"
  | "removing batches";

const NAVY = "#202F41";
const BLUE = "#3988E8";
const BG = "#F1F6FA";
const BORDER = "#DDE5EC";

const FREQUENCIES: { label: string; value: Frequency }[] = [
  { label: "Monthly", value: "monthly" },
  { label: "Quarterly", value: "quarterly" },
  { label: "Half-yearly", value: "half_yearly" },
  { label: "Yearly", value: "yearly" },
  { label: "One-time", value: "one_time" },
];

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "N/A"];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const formatDate = (value: string) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Select date";

function errorMessage(error: any): string {
  return [
    error?.message,
    error?.details,
    error?.hint,
    error?.code ? `Code: ${error.code}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export default function AddStudentsScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    mode?: string;
  }>();
  const editStudentId = Array.isArray(params.id) ? params.id[0] : params.id;
  const isEditMode = params.mode === "edit" && !!editStudentId;

  const [instituteId, setInstituteId] = useState("");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  const [photoUri, setPhotoUri] = useState("");
  const [newPhotoUri, setNewPhotoUri] = useState("");
  const [existingPhotoPath, setExistingPhotoPath] = useState("");
  const [name, setName] = useState("");
  const [roll, setRoll] = useState("");
  const [school, setSchool] = useState("");
  const [phone, setPhone] = useState("");
  const [father, setFather] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [batchIds, setBatchIds] = useState<string[]>([]);

  const [admission, setAdmission] = useState(todayISO());
  const [gender, setGender] = useState("Male");
  const [dob, setDob] = useState("");
  const [blood, setBlood] = useState("N/A");
  const [address, setAddress] = useState("");

  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [amount, setAmount] = useState("");
  const [billingDay, setBillingDay] = useState(5);
  const [hasExistingFee, setHasExistingFee] = useState(false);
  const [originalClassId, setOriginalClassId] = useState("");
  const [originalSubjectIds, setOriginalSubjectIds] = useState<string[]>([]);
  const [originalBatchIds, setOriginalBatchIds] = useState<string[]>([]);

  const [picker, setPicker] = useState<
    | "class"
    | "subjects"
    | "batches"
    | "blood"
    | "admission"
    | "dob"
    | "billing"
    | null
  >(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const [notice, setNotice] = useState<{
    title: string;
    message: string;
    success?: boolean;
  } | null>(null);

  const chosenClass = classes.find((item) => item.id === classId);

  const visibleSubjects = useMemo(
    () => subjects.filter((item) => item.class_id === classId),
    [subjects, classId],
  );

  const visibleBatches = useMemo(
    () => batches.filter((item) => !item.class_id || item.class_id === classId),
    [batches, classId],
  );

  const showError = (title: string, message: string) => {
    setNotice({ title, message });
  };

  useEffect(() => {
    let mounted = true;

    async function loadForm() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;
        if (!user) throw new Error("Please sign in before adding a student.");

        const { data: memberships, error: memberError } = await supabase
          .from("institute_members")
          .select("institute_id, role")
          .eq("user_id", user.id);

        if (memberError) throw memberError;

        if (!memberships?.length) {
          throw new Error("Your account is not linked to an institute.");
        }

        if (memberships.length !== 1) {
          throw new Error(
            "Your account is linked to multiple institutes. Select the active institute first.",
          );
        }

        const membership = memberships[0];

        if (!["owner", "manager"].includes(membership.role)) {
          throw new Error(
            "Only institute owners and managers can add students.",
          );
        }

        const id = membership.institute_id;

        const [classResult, subjectResult, batchResult] = await Promise.all([
          supabase
            .from("institute_classes")
            .select("id, name, default_fee_amount, default_fee_frequency")
            .eq("institute_id", id)
            .eq("is_active", true)
            .order("name"),

          supabase
            .from("institute_subjects")
            .select("id, name, class_id")
            .eq("institute_id", id)
            .order("name"),

          supabase
            .from("institute_batches")
            .select("id, name, class_id")
            .eq("institute_id", id)
            .eq("is_active", true)
            .order("name"),
        ]);

        if (classResult.error) throw classResult.error;
        if (subjectResult.error) throw subjectResult.error;
        if (batchResult.error) throw batchResult.error;

        if (!mounted) return;

        let loadedClasses = classResult.data ?? [];
        const loadedSubjects = subjectResult.data ?? [];
        let loadedBatches = batchResult.data ?? [];

        if (isEditMode && editStudentId) {
          const { data: existingStudent, error: studentError } = await supabase
            .from("institute_students")
            .select(
              "id,institute_id,full_name,roll_number,school_name,phone,father_name,class_id,admission_date,gender,date_of_birth,blood_group,address,photo_path",
            )
            .eq("id", editStudentId)
            .eq("institute_id", id)
            .maybeSingle();

          if (studentError) throw studentError;
          if (!existingStudent) {
            throw new Error("The student could not be found in this institute.");
          }

          const [
            { data: studentSubjects, error: studentSubjectsError },
            { data: studentBatches, error: studentBatchesError },
            { data: studentFee, error: studentFeeError },
          ] = await Promise.all([
            supabase
              .from("institute_student_subjects")
              .select("subject_id")
              .eq("student_id", editStudentId),
            supabase
              .from("institute_student_batches")
              .select("batch_id")
              .eq("student_id", editStudentId),
            supabase
              .from("institute_student_fees")
              .select("fee_frequency,fee_amount,billing_day")
              .eq("institute_id", id)
              .eq("student_id", editStudentId)
              .maybeSingle(),
          ]);

          if (studentSubjectsError) throw studentSubjectsError;
          if (studentBatchesError) throw studentBatchesError;
          if (studentFeeError) throw studentFeeError;

          const subjectIds = (studentSubjects ?? []).map(
            (item) => item.subject_id,
          );
          const batchIds = (studentBatches ?? []).map((item) => item.batch_id);

          if (
            !loadedClasses.some((item) => item.id === existingStudent.class_id)
          ) {
            const { data: existingClass, error: existingClassError } =
              await supabase
                .from("institute_classes")
                .select(
                  "id,name,default_fee_amount,default_fee_frequency",
                )
                .eq("id", existingStudent.class_id)
                .eq("institute_id", id)
                .maybeSingle();

            if (existingClassError) throw existingClassError;
            if (existingClass) loadedClasses = [...loadedClasses, existingClass];
          }

          const missingBatchIds = batchIds.filter(
            (batchId) => !loadedBatches.some((item) => item.id === batchId),
          );
          if (missingBatchIds.length) {
            const { data: existingBatches, error: existingBatchesError } =
              await supabase
                .from("institute_batches")
                .select("id,name,class_id")
                .eq("institute_id", id)
                .in("id", missingBatchIds);

            if (existingBatchesError) throw existingBatchesError;
            loadedBatches = [...loadedBatches, ...(existingBatches ?? [])];
          }

          if (!mounted) return;

          if (existingStudent.photo_path) {
            const { data: photo, error: photoError } = await supabase.storage
              .from("student-photos")
              .createSignedUrl(existingStudent.photo_path, 3600);

            if (!mounted) return;

            if (photoError) {
              console.warn("Student photo:", photoError.message);
            }
            setExistingPhotoPath(existingStudent.photo_path);
            setPhotoUri(photo?.signedUrl ?? "");
          }

          setName(existingStudent.full_name);
          setRoll(existingStudent.roll_number.replace(/^GAK/i, ""));
          setSchool(existingStudent.school_name ?? "");
          setPhone(existingStudent.phone ?? "");
          setFather(existingStudent.father_name ?? "");
          setClassId(existingStudent.class_id);
          setSubjectIds(subjectIds);
          setBatchIds(batchIds);
          setAdmission(existingStudent.admission_date);
          setGender(existingStudent.gender ?? "Male");
          setDob(existingStudent.date_of_birth ?? "");
          setBlood(existingStudent.blood_group ?? "N/A");
          setAddress(existingStudent.address ?? "");
          setOriginalClassId(existingStudent.class_id);
          setOriginalSubjectIds(subjectIds);
          setOriginalBatchIds(batchIds);

          if (studentFee) {
            setFrequency(studentFee.fee_frequency as Frequency);
            setAmount(String(studentFee.fee_amount));
            setBillingDay(studentFee.billing_day ?? 5);
            setHasExistingFee(true);
          } else {
            const classDefault = loadedClasses.find(
              (item) => item.id === existingStudent.class_id,
            );
            setAmount(
              classDefault?.default_fee_amount == null
                ? ""
                : String(classDefault.default_fee_amount),
            );
            setFrequency(classDefault?.default_fee_frequency ?? "monthly");
          }
        }

        setInstituteId(id);
        setClasses(loadedClasses);
        setSubjects(loadedSubjects);
        setBatches(loadedBatches);
      } catch (error: any) {
        if (mounted) {
          showError(
            "Unable to load form",
            errorMessage(error) || "Please try again.",
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadForm();
    return () => {
      mounted = false;
    };
  }, [editStudentId, isEditMode]);

  const choosePhoto = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        showError(
          "Permission required",
          "Allow photo library access to select a student photo.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        setNewPhotoUri(result.assets[0].uri);
        setPhotoUri(result.assets[0].uri);
      }
    } catch (error: any) {
      showError("Photo selection failed", errorMessage(error));
    }
  };

  const chooseClass = (id: string) => {
    setClassId(id);
    const selectedClass = classes.find((item) => item.id === id);
    setAmount(
      selectedClass?.default_fee_amount == null
        ? ""
        : String(selectedClass.default_fee_amount),
    );
    setFrequency(selectedClass?.default_fee_frequency ?? "monthly");
    setSubjectIds([]);
    setBatchIds([]);
    setPicker(null);
  };

  const toggleId = (
    id: string,
    current: string[],
    update: (value: string[]) => void,
  ) => {
    update(
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  };

  const validateBasic = () => {
    if (!name.trim()) return "Enter the student's full name.";
    if (!roll.trim()) return "Enter the roll number.";
    if (!classId) return "Choose a class.";
    if (!admission) return "Choose the admission date.";
    if (!batchIds.length) return "Choose at least one batch.";

    if (phone.trim() && !/^[0-9+\-()\s]{7,20}$/.test(phone.trim())) {
      return "Enter a valid phone number.";
    }

    if (dob && dob > todayISO()) {
      return "Date of birth cannot be in the future.";
    }

    return "";
  };

  const uploadPhoto = async (
    uri: string,
    iid: string,
    studentId: string,
  ): Promise<string> => {
    const fileInfo = await FileSystem.getInfoAsync(uri);

    if (!fileInfo.exists || fileInfo.isDirectory) {
      throw new Error(
        "The selected photo is no longer available. Please select it again.",
      );
    }

    const match = uri.split("?")[0].match(/\.(png|webp|jpe?g)$/i);
    const extension = match?.[1]?.toLowerCase();

    const mimeType =
      extension === "png"
        ? "image/png"
        : extension === "webp"
          ? "image/webp"
          : "image/jpeg";

    const ext =
      mimeType === "image/png"
        ? "png"
        : mimeType === "image/webp"
          ? "webp"
          : "jpg";

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (!base64) {
      throw new Error(
        "The selected photo is empty. Please choose another image.",
      );
    }

    const path = `${iid}/${studentId}/profile.${ext}`;

    const { error } = await supabase.storage
      .from("student-photos")
      .upload(path, decode(base64), {
        contentType: mimeType,
        upsert: true,
      });

    if (error) throw error;

    return path;
  };

  const save = async () => {
    if (saving) return;

    const basicError = validateBasic();

    if (basicError) {
      setStep(1);
      showError("Check student details", basicError);
      return;
    }

    const shouldSaveFee = !isEditMode || hasExistingFee || !!amount.trim();
    const feeAmount = Number(amount);

    if (
      shouldSaveFee &&
      (!amount.trim() || !Number.isFinite(feeAmount) || feeAmount < 0)
    ) {
      showError("Invalid fee", "Enter a valid fee amount.");
      return;
    }

    setSaving(true);

    let stage: Stage = "checking authentication";
    let studentId: string | null = isEditMode ? editStudentId ?? null : null;
    let studentCreated = false;

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Your session has expired. Sign in again.");

      stage = "checking membership";

      const { data: membership, error: membershipError } = await supabase
        .from("institute_members")
        .select("institute_id, role")
        .eq("user_id", user.id)
        .eq("institute_id", instituteId)
        .maybeSingle();

      if (membershipError) throw membershipError;

      if (!membership || !["owner", "manager"].includes(membership.role)) {
        throw new Error(
          "You do not have owner/manager access to this institute.",
        );
      }

      stage = "validating class";

      const { data: classRow, error: classError } = await supabase
        .from("institute_classes")
        .select("id,is_active")
        .eq("id", classId)
        .eq("institute_id", instituteId)
        .maybeSingle();

      if (classError) throw classError;
      if (
        !classRow ||
        (!classRow.is_active && classId !== originalClassId)
      ) {
        throw new Error("The selected class is invalid or inactive.");
      }

      stage = "validating subjects";

      if (subjectIds.length) {
        const { data: validSubjects, error: subjectError } = await supabase
          .from("institute_subjects")
          .select("id")
          .eq("institute_id", instituteId)
          .eq("class_id", classId)
          .in("id", subjectIds);

        if (subjectError) throw subjectError;

        const validIds = new Set((validSubjects ?? []).map((item) => item.id));
        const invalidIds = subjectIds.filter((id) => !validIds.has(id));

        if (invalidIds.length) {
          throw new Error(
            "One or more selected subjects do not belong to the chosen class. Return to Basic details and choose the subjects again.",
          );
        }
      }

      stage = "validating batches";

      const { data: validBatches, error: batchValidationError } = await supabase
        .from("institute_batches")
        .select("id, class_id, is_active")
        .eq("institute_id", instituteId)
        .in("id", batchIds);

      if (batchValidationError) throw batchValidationError;

      const validBatchIds = new Set(
        (validBatches ?? [])
          .filter(
            (batch) =>
              (!batch.class_id || batch.class_id === classId) &&
              (batch.is_active ||
                (originalClassId === classId &&
                  originalBatchIds.includes(batch.id))),
          )
          .map((batch) => batch.id),
      );

      if (batchIds.some((id) => !validBatchIds.has(id))) {
        throw new Error(
          "One or more selected batches are invalid for this class. Choose the batches again.",
        );
      }

      const studentData = {
        institute_id: instituteId,
        full_name: name.trim(),
        roll_number: `GAK${roll.trim()}`,
        school_name: school.trim() || null,
        phone: phone.trim() || null,
        father_name: father.trim() || null,
        class_id: classId,
        admission_date: admission,
        gender,
        date_of_birth: dob || null,
        blood_group: blood,
        address: address.trim() || null,
      };

      if (isEditMode && editStudentId) {
        stage = "updating student";

        const { data: updatedStudent, error: studentError } = await supabase
          .from("institute_students")
          .update(studentData)
          .eq("id", editStudentId)
          .eq("institute_id", instituteId)
          .select("id")
          .maybeSingle();

        if (studentError) {
          if (studentError.code === "23505") {
            throw new Error(
              "This GAK roll number already exists. Enter a different roll number.",
            );
          }
          throw studentError;
        }

        if (!updatedStudent?.id) {
          throw new Error(
            "The student could not be updated. Check your access and try again.",
          );
        }

        studentId = updatedStudent.id;
      } else {
        stage = "creating student";

        const { data: student, error: studentError } = await supabase
          .from("institute_students")
          .insert({ ...studentData, status: "active" })
          .select("id")
          .single();

        if (studentError) {
          if (studentError.code === "23505") {
            throw new Error(
              "This GAK roll number already exists. Enter a different roll number.",
            );
          }
          throw studentError;
        }

        if (!student?.id)
          throw new Error("The database did not return the student ID.");

        studentId = student.id;
        studentCreated = true;
      }

      if (!studentId) {
        throw new Error("The database did not return the student ID.");
      }

      // Each stage is reported separately. Supabase RLS must permit the operation.
      if (newPhotoUri) {
        stage = "uploading photo";

        const photoPath = await uploadPhoto(
          newPhotoUri,
          instituteId,
          studentId,
        );

        stage = "saving photo path";

        const { error: photoPathError } = await supabase
          .from("institute_students")
          .update({ photo_path: photoPath })
          .eq("id", studentId)
          .eq("institute_id", instituteId);

        if (photoPathError) throw photoPathError;
      }

      const subjectIdsToRemove = originalSubjectIds.filter(
        (id) => !subjectIds.includes(id),
      );
      const subjectIdsToAdd = subjectIds.filter(
        (id) => !originalSubjectIds.includes(id),
      );

      if (isEditMode && subjectIdsToRemove.length) {
        stage = "removing subjects";

        const { error: subjectDeleteError } = await supabase
          .from("institute_student_subjects")
          .delete()
          .eq("student_id", studentId)
          .in("subject_id", subjectIdsToRemove);

        if (subjectDeleteError) throw subjectDeleteError;
      }

      if (subjectIdsToAdd.length || (!isEditMode && subjectIds.length)) {
        stage = "saving subjects";
        const idsToInsert = isEditMode ? subjectIdsToAdd : subjectIds;
        const rows = idsToInsert.map((subject_id) => ({
          student_id: studentId,
          subject_id,
        }));

        const { error: subjectInsertError } = await supabase
          .from("institute_student_subjects")
          .insert(rows);

        if (subjectInsertError) throw subjectInsertError;
      }

      stage = "saving batches";

      if (isEditMode && editStudentId) {
        const { data: existingBatches, error: fetchBatchesError } =
          await supabase
            .from("institute_student_batches")
            .select("batch_id")
            .eq("student_id", editStudentId);

        if (fetchBatchesError) throw fetchBatchesError;

        const existingBatchIds = new Set(
          (existingBatches ?? []).map((item) => item.batch_id),
        );
        const batchesToInsert = batchIds
          .filter((batchId) => !existingBatchIds.has(batchId))
          .map((batchId) => ({
            student_id: editStudentId,
            batch_id: batchId,
          }));

        if (batchesToInsert.length) {
          const { error: insertBatchesError } = await supabase
            .from("institute_student_batches")
            .insert(batchesToInsert);

          if (insertBatchesError) throw insertBatchesError;
        }

        const selectedBatchIds = new Set(batchIds);
        const batchesToRemove = (existingBatches ?? [])
          .map((item) => item.batch_id)
          .filter((batchId) => !selectedBatchIds.has(batchId));

        if (batchesToRemove.length) {
          const { error: deleteBatchesError } = await supabase
            .from("institute_student_batches")
            .delete()
            .eq("student_id", editStudentId)
            .in("batch_id", batchesToRemove);

          if (deleteBatchesError) throw deleteBatchesError;
        }
      } else if (batchIds.length) {
        const { error: insertBatchesError } = await supabase
          .from("institute_student_batches")
          .insert(
            batchIds.map((batchId) => ({
              student_id: studentId,
              batch_id: batchId,
            })),
          );

        if (insertBatchesError) throw insertBatchesError;
      }

      stage = "saving fee";

      if (shouldSaveFee) {
        const feeData = {
          institute_id: instituteId,
          student_id: studentId,
          fee_frequency: frequency,
          fee_amount: feeAmount,
          billing_day: frequency === "one_time" ? null : billingDay,
        };

        if (hasExistingFee) {
          const { data: updatedFee, error: feeError } = await supabase
            .from("institute_student_fees")
            .update(feeData)
            .eq("institute_id", instituteId)
            .eq("student_id", studentId)
            .select("student_id")
            .maybeSingle();

          if (feeError) throw feeError;
          if (!updatedFee) {
            throw new Error(
              "The existing fee configuration could not be updated.",
            );
          }
        } else {
          const { error: feeError } = await supabase
            .from("institute_student_fees")
            .insert(feeData);

          if (feeError) throw feeError;
        }
      }

      setNotice({
        title: isEditMode ? "Student updated" : "Student saved",
        message: isEditMode
          ? `${name.trim()} has been updated successfully.`
          : `${name.trim()} has been added successfully.`,
        success: true,
      });
    } catch (error: any) {
      console.error("[Add Student] save failed", {
        stage,
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        studentId,
      });

      const partialMessage = studentCreated
        ? `\n\nStudent record already exists (ID: ${studentId}). Do not submit this form again for the same student. Check the Students list and retry only the failed operation.`
        : "";

      showError(
        "Unable to save student",
        `Failed while ${stage}:\n${errorMessage(error) || "Unknown error."}${partialMessage}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const field = (
    label: string,
    value: string,
    update: (value: string) => void,
    placeholder: string,
    keyboardType: any = "default",
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={update}
        placeholder={placeholder}
        placeholderTextColor="#9AA5AF"
        keyboardType={keyboardType}
        style={styles.input}
      />
    </View>
  );

  const openDate = (kind: "admission" | "dob") => {
    const selected = kind === "admission" ? admission : dob;
    setCalendarMonth(new Date(`${selected || todayISO()}T12:00:00`));
    setPicker(kind);
  };

  const daysInMonth = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth() + 1,
    0,
  ).getDate();

  const firstWeekday = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth(),
    1,
  ).getDay();

  const calendarCells = [
    ...Array(firstWeekday).fill(0),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const modalTitle =
    picker === "class"
      ? "Select class"
      : picker === "subjects"
        ? "Select subjects"
        : picker === "batches"
          ? "Select batches"
          : picker === "blood"
            ? "Select blood group"
            : picker === "billing"
              ? "Billing day"
              : "Select date";

  const options =
    picker === "class"
      ? classes
      : picker === "subjects"
        ? visibleSubjects
        : picker === "batches"
          ? visibleBatches
          : picker === "blood"
            ? BLOOD_GROUPS.map((name) => ({ id: name, name }))
            : [];

  const selectedIds = picker === "subjects" ? subjectIds : batchIds;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={BLUE} />
        <Text style={styles.loadingText}>Loading student form...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.header}>
        <Pressable
          onPress={() => (step === 2 ? setStep(1) : router.back())}
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={28} color={NAVY} />
        </Pressable>

        <Text style={styles.headerTitle}>
          {isEditMode ? "Edit Student" : "Add Student"}
        </Text>

        <Pressable
          style={styles.help}
          onPress={() =>
            showError(
              "Help",
              isEditMode
                ? "Update the student details, class, batches, and fee, then save your changes."
                : "Complete the Basic details, select a class and batch, then configure the fee and save.",
            )
          }
        >
          <Text style={styles.helpText}>Help?</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.steps}>
          <View style={[styles.stepCircle, styles.stepComplete]}>
            <Text style={styles.stepNumber}>{step === 1 ? "1" : "✓"}</Text>
          </View>
          <View style={[styles.stepLine, step === 2 && styles.stepLineDone]} />
          <View style={[styles.stepCircle, step === 2 && styles.stepActive]}>
            <Text style={styles.stepNumber}>2</Text>
          </View>
        </View>

        <View style={styles.stepLabels}>
          <Text style={styles.stepLabel}>Basic</Text>
          <Text style={styles.stepLabel}>Fee</Text>
        </View>

        {step === 1 ? (
          <>
            <Pressable
              style={styles.photoArea}
              onPress={() => void choosePhoto()}
            >
              <View style={styles.photoFrame}>
                {photoUri || existingPhotoPath ? (
                  <Image source={{ uri: photoUri }} style={styles.photo} />
                ) : (
                  <Feather name="camera" size={34} color="#9CB0BE" />
                )}
              </View>
              <Text style={styles.photoLabel}>
                {photoUri || existingPhotoPath ? "Change photo" : "Add photo"}
              </Text>
            </Pressable>

            {field("Student full name *", name, setName, "Student's name")}

            <View style={styles.field}>
              <Text style={styles.label}>Roll number *</Text>
              <View style={styles.rollWrap}>
                <Text style={styles.prefix}>GAK</Text>
                <TextInput
                  value={roll}
                  onChangeText={(value) => setRoll(value.replace(/\D/g, ""))}
                  keyboardType="number-pad"
                  placeholder="001"
                  placeholderTextColor="#9AA5AF"
                  style={styles.rollInput}
                />
              </View>
            </View>

            {field("School name", school, setSchool, "School name (optional)")}
            {field(
              "Student / Parent's phone",
              phone,
              setPhone,
              "Phone number",
              "phone-pad",
            )}
            {field("Father's name", father, setFather, "Father's full name")}

            <Text style={styles.label}>Class *</Text>
            <Pressable style={styles.select} onPress={() => setPicker("class")}>
              <Text style={styles.selectText}>
                {chosenClass?.name ?? "Choose class"}
              </Text>
              <Feather name="book-open" size={20} color="#5C7082" />
            </Pressable>

            <Text style={styles.label}>Subjects</Text>
            <Pressable
              style={styles.select}
              onPress={() =>
                classId
                  ? setPicker("subjects")
                  : showError(
                      "Choose class first",
                      "Select a class before choosing subjects.",
                    )
              }
            >
              <Text style={styles.selectText}>
                {subjectIds.length
                  ? `${subjectIds.length} selected`
                  : "Choose subjects"}
              </Text>
              <Feather name="chevron-down" size={20} color="#5C7082" />
            </Pressable>

            <Text style={styles.label}>Admission date *</Text>
            <Pressable
              style={styles.select}
              onPress={() => openDate("admission")}
            >
              <Text style={styles.selectText}>{formatDate(admission)}</Text>
              <Feather name="calendar" size={20} color="#5C7082" />
            </Pressable>

            <Text style={styles.label}>Gender</Text>
            <View style={styles.genderRow}>
              {["Male", "Female", "Other"].map((value) => (
                <Pressable
                  key={value}
                  onPress={() => setGender(value)}
                  style={[
                    styles.genderOption,
                    gender === value && styles.genderActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.genderText,
                      gender === value && styles.genderTextActive,
                    ]}
                  >
                    {value}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Date of birth</Text>
            <Pressable style={styles.select} onPress={() => openDate("dob")}>
              <Text style={styles.selectText}>{formatDate(dob)}</Text>
              <Feather name="calendar" size={20} color="#5C7082" />
            </Pressable>

            <Text style={styles.label}>Blood group</Text>
            <Pressable style={styles.select} onPress={() => setPicker("blood")}>
              <Text style={styles.selectText}>{blood}</Text>
              <Feather name="chevron-down" size={20} color="#5C7082" />
            </Pressable>

            <View style={styles.field}>
              <Text style={styles.label}>Address</Text>
              <TextInput
                value={address}
                onChangeText={setAddress}
                multiline
                placeholder="Student address"
                placeholderTextColor="#9AA5AF"
                style={[styles.input, styles.addressInput]}
              />
            </View>

            <Text style={styles.label}>Batches *</Text>
            <Text style={styles.hint}>
              {visibleBatches.length
                ? "Choose one or more batches."
                : "No batches available for this class yet."}
            </Text>

            <Pressable
              style={styles.select}
              onPress={() =>
                classId
                  ? setPicker("batches")
                  : showError(
                      "Choose class first",
                      "Select a class before choosing batches.",
                    )
              }
            >
              <Text style={styles.selectText}>
                {batchIds.length
                  ? `${batchIds.length} selected`
                  : "Choose batches"}
              </Text>
              <Feather name="chevron-down" size={20} color="#5C7082" />
            </Pressable>

            {!visibleBatches.length && (
              <Pressable
                style={styles.addBatch}
                onPress={() => router.push("/batches")}
              >
                <Text style={styles.addBatchText}>+ Add new batch</Text>
              </Pressable>
            )}
          </>
        ) : (
          <>
            <Text style={styles.feeTitle}>Set fee</Text>

            <View style={styles.freqWrap}>
              {FREQUENCIES.map((item) => (
                <Pressable
                  key={item.value}
                  onPress={() => setFrequency(item.value)}
                  style={[
                    styles.freq,
                    frequency === item.value && styles.freqActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.freqText,
                      frequency === item.value && styles.freqTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {field(
              `Enter ${FREQUENCIES.find((item) => item.value === frequency)?.label} fee *`,
              amount,
              setAmount,
              "500",
              "decimal-pad",
            )}

            {frequency !== "one_time" && (
              <>
                <Text style={styles.label}>Billing day *</Text>
                <Pressable
                  style={styles.select}
                  onPress={() => setPicker("billing")}
                >
                  <Text style={styles.selectText}>Day {billingDay}</Text>
                  <Feather name="calendar" size={20} color="#5C7082" />
                </Pressable>
                <Text style={styles.hint}>
                  Fee billing repeats on this day each cycle.
                </Text>
              </>
            )}

            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>Student summary</Text>
              <Text style={styles.summaryText}>
                {name} · GAK{roll}
              </Text>
              <Text style={styles.summaryText}>
                {chosenClass?.name} · {batchIds.length} batch(es) ·{" "}
                {subjectIds.length} subject(s)
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step === 1 ? (
          <Pressable
            style={styles.primary}
            onPress={() => {
              Keyboard.dismiss();
              const validation = validateBasic();
              if (validation) showError("Check details", validation);
              else setStep(2);
            }}
          >
            <Text style={styles.primaryText}>Continue</Text>
            <Feather name="arrow-right" size={20} color="#FFFFFF" />
          </Pressable>
        ) : (
          <View style={styles.footerRow}>
            <Pressable
              style={styles.backStep}
              onPress={() => setStep(1)}
              disabled={saving}
            >
              <Text style={styles.backText}>Back</Text>
            </Pressable>
            <Pressable
              style={[
                styles.primary,
                styles.saveButton,
                saving && styles.disabled,
              ]}
              onPress={() => void save()}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryText}>
                  {isEditMode ? "Update Student" : "Save Student"}
                </Text>
              )}
            </Pressable>
          </View>
        )}
      </View>

      <Modal
        visible={!!picker}
        transparent
        animationType="fade"
        onRequestClose={() => setPicker(null)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.shade} onPress={() => setPicker(null)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{modalTitle}</Text>

            {["class", "subjects", "batches", "blood"].includes(
              picker ?? "",
            ) && (
              <ScrollView style={styles.optionsList}>
                {options.map((option: any) => {
                  const isSelected =
                    picker === "class"
                      ? classId === option.id
                      : picker === "blood"
                        ? blood === option.name
                        : selectedIds.includes(option.id);

                  return (
                    <Pressable
                      key={option.id}
                      style={styles.option}
                      onPress={() => {
                        if (picker === "class") {
                          chooseClass(option.id);
                        } else if (picker === "blood") {
                          setBlood(option.name);
                          setPicker(null);
                        } else if (picker === "subjects") {
                          toggleId(option.id, subjectIds, setSubjectIds);
                        } else {
                          toggleId(option.id, batchIds, setBatchIds);
                        }
                      }}
                    >
                      <Text style={styles.optionText}>{option.name}</Text>
                      {isSelected && (
                        <Feather name="check-circle" size={20} color={BLUE} />
                      )}
                    </Pressable>
                  );
                })}

                {!options.length && (
                  <Text style={styles.hint}>No options available.</Text>
                )}
              </ScrollView>
            )}

            {(picker === "subjects" || picker === "batches") && (
              <Pressable style={styles.done} onPress={() => setPicker(null)}>
                <Text style={styles.primaryText}>
                  Done ({selectedIds.length} selected)
                </Text>
              </Pressable>
            )}

            {(picker === "admission" || picker === "dob") && (
              <>
                <View style={styles.monthRow}>
                  <Pressable
                    onPress={() =>
                      setCalendarMonth(
                        new Date(
                          calendarMonth.getFullYear(),
                          calendarMonth.getMonth() - 1,
                          1,
                        ),
                      )
                    }
                  >
                    <Feather name="chevron-left" size={24} color={NAVY} />
                  </Pressable>

                  <Text style={styles.monthTitle}>
                    {calendarMonth.toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </Text>

                  <Pressable
                    onPress={() =>
                      setCalendarMonth(
                        new Date(
                          calendarMonth.getFullYear(),
                          calendarMonth.getMonth() + 1,
                          1,
                        ),
                      )
                    }
                  >
                    <Feather name="chevron-right" size={24} color={NAVY} />
                  </Pressable>
                </View>

                <View style={styles.calendar}>
                  {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                    <Text key={`${day}${index}`} style={styles.weekday}>
                      {day}
                    </Text>
                  ))}

                  {calendarCells.map((day, index) =>
                    day === 0 ? (
                      <View key={`blank${index}`} style={styles.dayCell} />
                    ) : (
                      <Pressable
                        key={day}
                        style={styles.dayCell}
                        onPress={() => {
                          const value = [
                            calendarMonth.getFullYear(),
                            String(calendarMonth.getMonth() + 1).padStart(
                              2,
                              "0",
                            ),
                            String(day).padStart(2, "0"),
                          ].join("-");

                          if (picker === "admission") setAdmission(value);
                          else setDob(value);

                          setPicker(null);
                        }}
                      >
                        <Text style={styles.dayText}>{day}</Text>
                      </Pressable>
                    ),
                  )}
                </View>
              </>
            )}

            {picker === "billing" && (
              <View style={styles.billingGrid}>
                {Array.from({ length: 31 }, (_, index) => index + 1).map(
                  (day) => (
                    <Pressable
                      key={day}
                      style={[
                        styles.billingDay,
                        billingDay === day && styles.billingSelected,
                      ]}
                      onPress={() => {
                        setBillingDay(day);
                        setPicker(null);
                      }}
                    >
                      <Text
                        style={[
                          styles.billingText,
                          billingDay === day && styles.billingTextSelected,
                        ]}
                      >
                        {day}
                      </Text>
                    </Pressable>
                  ),
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!notice}
        transparent
        animationType="fade"
        onRequestClose={() => setNotice(null)}
      >
        <View style={styles.alertOverlay}>
          <View style={styles.alertCard}>
            <View
              style={[styles.alertIcon, notice?.success && styles.successIcon]}
            >
              <Feather
                name={notice?.success ? "check-circle" : "x-circle"}
                size={38}
                color={notice?.success ? "#21864A" : "#C84555"}
              />
            </View>
            <Text style={styles.alertTitle}>{notice?.title}</Text>
            <ScrollView style={styles.alertMessageScroll}>
              <Text style={styles.alertMessage}>{notice?.message}</Text>
            </ScrollView>
            <Pressable
              style={[
                styles.alertButton,
                notice?.success && styles.alertButtonSuccess,
              ]}
              onPress={() => {
                const wasSuccess = notice?.success;
                setNotice(null);
                if (wasSuccess) {
                  if (isEditMode && editStudentId) {
                    router.replace({
                      pathname: "/student-details",
                      params: { id: editStudentId },
                    });
                  } else {
                    router.replace("/students");
                  }
                }
              }}
            >
              <Text style={styles.alertButtonText}>OK</Text>
              <Feather name="arrow-right" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BG,
  },
  loadingText: { marginTop: 12, color: "#71869A" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 17,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5EAF0",
  },
  headerTitle: { flex: 1, fontSize: 23, fontWeight: "800", color: NAVY },
  help: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  helpText: { color: "#6382A2", fontWeight: "700" },

  content: { padding: 20, paddingBottom: 25 },
  steps: { flexDirection: "row", alignItems: "center" },
  stepCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#E7EDF3",
    alignItems: "center",
    justifyContent: "center",
  },
  stepActive: { backgroundColor: NAVY },
  stepComplete: { backgroundColor: "#5DBA68" },
  stepNumber: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  stepLine: {
    flex: 1,
    height: 3,
    backgroundColor: "#DDE5EC",
    marginHorizontal: 9,
  },
  stepLineDone: { backgroundColor: "#5DBA68" },
  stepLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 7,
    marginBottom: 22,
  },
  stepLabel: { fontSize: 12, color: "#71869A", fontWeight: "700" },

  photoArea: { alignItems: "center", marginBottom: 24 },
  photoFrame: {
    width: 112,
    height: 112,
    borderRadius: 28,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#C8D4DE",
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photo: { width: "100%", height: "100%" },
  photoLabel: {
    color: "#6685A7",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 10,
  },

  field: { marginBottom: 18 },
  label: {
    color: "#243345",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    minHeight: 58,
    borderWidth: 1.3,
    borderColor: "#DADFE4",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 15,
    color: "#243345",
    fontSize: 15,
  },
  addressInput: { height: 84, textAlignVertical: "top", paddingTop: 14 },
  rollWrap: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.3,
    borderColor: "#C9D4DE",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 15,
  },
  prefix: { color: NAVY, fontWeight: "800", fontSize: 16, marginRight: 8 },
  rollInput: { flex: 1, minHeight: 55, color: "#243345", fontSize: 15 },

  select: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.3,
    borderColor: "#DADFE4",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 15,
    marginBottom: 18,
  },
  selectText: { color: "#243345", fontSize: 15, flex: 1 },
  genderRow: {
    flexDirection: "row",
    backgroundColor: "#EAF0F6",
    borderRadius: 13,
    padding: 4,
    marginBottom: 18,
  },
  genderOption: {
    flex: 1,
    minHeight: 43,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  genderActive: { backgroundColor: NAVY },
  genderText: { color: "#5C7082", fontSize: 13, fontWeight: "700" },
  genderTextActive: { color: "#FFFFFF" },
  hint: { color: "#91A7B5", fontSize: 12, marginBottom: 10, lineHeight: 18 },
  addBatch: {
    minHeight: 45,
    borderWidth: 1.3,
    borderColor: NAVY,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },
  addBatchText: { color: NAVY, fontWeight: "800" },

  footer: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E8EDF2",
  },
  footerRow: { flexDirection: "row", gap: 10 },
  primary: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 12,
    backgroundColor: NAVY,
    paddingHorizontal: 15,
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  saveButton: { flex: 1 },
  disabled: { opacity: 0.65 },
  backStep: {
    width: "30%",
    minHeight: 54,
    borderWidth: 1.5,
    borderColor: NAVY,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  backText: { color: NAVY, fontWeight: "700" },

  feeTitle: { fontSize: 20, fontWeight: "800", color: NAVY, marginBottom: 16 },
  freqWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginBottom: 25,
  },
  freq: {
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
    borderRadius: 25,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  freqActive: { backgroundColor: NAVY, borderColor: NAVY },
  freqText: { color: "#5C7082", fontWeight: "700", fontSize: 13 },
  freqTextActive: { color: "#FFFFFF" },
  summary: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
    marginTop: 12,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: NAVY,
    marginBottom: 8,
  },
  summaryText: { color: "#91A7B5", fontSize: 13, marginBottom: 8 },

  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(17,35,52,0.38)",
  },
  shade: { ...StyleSheet.absoluteFillObject },
  sheet: {
    maxHeight: "82%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === "ios" ? 30 : 20,
  },
  handle: {
    width: 43,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D0DCE6",
    alignSelf: "center",
    marginBottom: 17,
  },
  sheetTitle: {
    color: NAVY,
    fontSize: 23,
    fontWeight: "800",
    marginBottom: 15,
  },
  optionsList: { maxHeight: 420 },
  option: {
    minHeight: 55,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionText: { color: "#243345", fontSize: 15, fontWeight: "600" },
  done: {
    minHeight: 50,
    backgroundColor: NAVY,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },

  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  monthTitle: { color: NAVY, fontSize: 17, fontWeight: "800" },
  calendar: { flexDirection: "row", flexWrap: "wrap" },
  weekday: {
    width: "14.285%",
    textAlign: "center",
    color: "#96AAB9",
    fontWeight: "800",
    paddingVertical: 10,
  },
  dayCell: {
    width: "14.285%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dayText: { color: "#243345", fontSize: 14, fontWeight: "600" },

  billingGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  billingDay: {
    width: "13.5%",
    aspectRatio: 1,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#E1E8EF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 9,
  },
  billingSelected: { backgroundColor: NAVY, borderColor: NAVY },
  billingText: { color: "#243345", fontWeight: "700" },
  billingTextSelected: { color: "#FFFFFF" },

  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(17,35,52,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  alertCard: {
    width: "100%",
    maxHeight: "85%",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 22,
    alignItems: "center",
  },
  alertIcon: {
    width: 82,
    height: 82,
    borderRadius: 25,
    backgroundColor: "#FDE9EC",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  successIcon: { backgroundColor: "#E4F6EA" },
  alertTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: NAVY,
    textAlign: "center",
    marginBottom: 14,
  },
  alertMessageScroll: { width: "100%", flexShrink: 1 },
  alertMessage: {
    color: "#71869A",
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
  },
  alertButton: {
    width: "100%",
    minHeight: 54,
    backgroundColor: "#D94B5A",
    borderRadius: 14,
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  alertButtonSuccess: { backgroundColor: "#21864A" },
  alertButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
});
