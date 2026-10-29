import React, { useCallback, useEffect, useState } from "react";



import {



  ActivityIndicator,



  Alert,



  Image,

  Modal,

  Pressable,



  RefreshControl,



  ScrollView,



  StatusBar,



  StyleSheet,



  Text,



  TouchableOpacity,



  View,



  useWindowDimensions,



} from "react-native";



import { Feather } from "@expo/vector-icons";

import * as ImagePicker from "expo-image-picker";



import { LinearGradient } from "expo-linear-gradient";



import { router } from "expo-router";



import { useSafeAreaInsets } from "react-native-safe-area-context";



import { supabase } from "../../lib/supabase";



const PURPLE = "#611CD0";



const PURPLE_DARK = "#44109D";



const NAVY = "#241344";



const BLUE = PURPLE;



const BG = "#F3F3FF";



const MUTED = "#718096";



const WHITE = "#FFFFFF";



const BORDER = "#E8E3F5";



type Teacher = {



  id: string;



  user_id: string;



  institute_id: string;



  full_name: string;



  phone: string | null;



  role: string;



  permissions: Record<string, boolean> | null;



  staff_id: string | null;



};



type Institute = {



  id: string;



  name: string | null;



  logo_url: string | null;



  slogan?: string | null;



};



type ModuleItem = {



  title: string;



  subtitle: string;



  icon: keyof typeof Feather.glyphMap;



  color: string;



  permission?: string;



};



const MODULES: ModuleItem[] = [



  {



    title: "Attendance",



    subtitle: "Mark attendance",



    icon: "check-square",



    color: "#611CD0",



    permission: "attendance",



  },



  {



    title: "Students",



    subtitle: "Student records",



    icon: "users",



    color: "#159A82",



    permission: "students",



  },



  {



    title: "Timetable",



    subtitle: "Your class schedule",



    icon: "calendar",



    color: "#805AD5",



  },



  {



    title: "My salary",



    subtitle: "View your salary details",



    icon: "dollar-sign",



    color: "#21805A",



  },



  {



    title: "Exams",



    subtitle: "Tests and marks",



    icon: "edit-3",



    color: "#D65B69",



    permission: "exams",



  },



  {



    title: "Notices",



    subtitle: "Institute updates",



    icon: "bell",



    color: "#6755D9",



    permission: "notices",



  },



  {



    title: "Books",



    subtitle: "Read and download books",



    icon: "book-open",



    color: "#3478C8",



  },



  {



    title: "Teachers",



    subtitle: "Connect with colleagues",



    icon: "user-check",



    color: "#0F8B8D",



  },



  {



    title: "Reports",



    subtitle: "Class performance",



    icon: "bar-chart-2",



    color: "#25956A",



    permission: "reports",



  },



  {



    title: "My Attendance",



    subtitle: "View your attendance calendar",



    icon: "calendar",



    color: "#611CD0",



  },



];



type Tab = "Home" | "Classes" | "Attendance" | "Timetable" | "Profile";



async function resolveStoredImage(



  value: string | null,



  bucket: string,



): Promise<string | null> {



  if (!value?.trim()) return null;



  const raw = value.trim();



  // External URLs and data URIs do not need Supabase URL resolution.



  if (/^https?:\/\//i.test(raw) && !raw.includes("/storage/v1/object/")) {



    return raw;



  }



  if (raw.startsWith("data:image/")) return raw;



  const publicMarker = `/storage/v1/object/public/${bucket}/`;



  const signMarker = `/storage/v1/object/sign/${bucket}/`;



  const authenticatedMarker = `/storage/v1/object/authenticated/${bucket}/`;



  // Public objects should use their public URL directly. Do not try to sign



  // them first, because signing can fail even though the public URL is valid.



  if (raw.includes(publicMarker)) {



    return raw;



  }



  let objectPath = raw;



  // Extract the object path from an existing signed/authenticated Storage URL.



  const privateMarker = [signMarker, authenticatedMarker].find((marker) =>



    raw.includes(marker),



  );



  if (privateMarker) {



    objectPath = raw



      .slice(raw.indexOf(privateMarker) + privateMarker.length)



      .split("?")[0];



  } else if (raw.includes("/storage/v1/object/")) {



    console.warn(



      `[teacher-dashboard] Storage URL does not match bucket "${bucket}":`,



      raw,



    );



    return null;



  }



  // Database values are usually paths relative to the bucket.



  objectPath = objectPath



    .split("?")[0]



    .replace(/^\/+/, "")



    .replace(new RegExp(`^${bucket}/`), "");



  objectPath = objectPath



    .split("/")



    .map((segment) => {



      try {



        return decodeURIComponent(segment);



      } catch {



        return segment;



      }



    })



    .join("/");



  if (!objectPath) return null;



  // Private bucket: create a fresh signed URL from the exact object path.



  const { data, error } = await supabase.storage



    .from(bucket)



    .createSignedUrl(objectPath, 60 * 60);



  if (!error && data?.signedUrl) {



    return data.signedUrl;



  }



  console.warn(



    `[teacher-dashboard] Signed URL failed for ${bucket}/${objectPath}:`,



    error?.message ?? "No signed URL returned",



  );



  // If signing fails, return null rather than a misleading URL for a private



  // object. Check the bucket name, exact path, and Storage policies.



  return null;



}



async function findInstituteLogo(



  instituteId: string,



  storedLogo: string | null,



) {



  const stored = await resolveStoredImage(storedLogo, "institute-assets");



  if (stored) return stored;



  // Some versions of the institute profile uploader save the logo in Storage



  // but do not persist its URL in institutes.logo_url. Look in this institute's



  // folder before falling back to the book icon.



  try {



    const { data, error } = await supabase.storage



      .from("institute-assets")



      .list(instituteId, {



        limit: 100,



        sortBy: { column: "created_at", order: "desc" },



      });



    if (error) throw error;



    const logo = (data ?? []).find(



      (item) => item.id && /^logo[-_.]/i.test(item.name),



    );



    if (!logo) return null;



    return await resolveStoredImage(



      `${instituteId}/${logo.name}`,



      "institute-assets",



    );



  } catch (error) {



    console.warn("[teacher-dashboard] Could not find institute logo:", error);



    return null;



  }



}



function formatFieldLabel(value: string): string {



  return value



    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")



    .replace(/_/g, " ")



    .replace(/\b\w/g, (letter) => letter.toUpperCase());



}



function formatFieldValue(value: unknown): string {



  if (value === null || value === undefined || value === "")



    return "Not provided";



  if (typeof value === "boolean") return value ? "Yes" : "No";



  if (typeof value === "object") return JSON.stringify(value);



  return String(value);



}



export default function TeacherDashboard() {



  const insets = useSafeAreaInsets();



  const { width } = useWindowDimensions();



  const [teacher, setTeacher] = useState<Teacher | null>(null);



  const [institute, setInstitute] = useState<Institute | null>(null);



  const [teacherPhoto, setTeacherPhoto] = useState<string | null>(null);

  const [photoModalVisible, setPhotoModalVisible] = useState(false);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);



  const [instituteLogo, setInstituteLogo] = useState<string | null>(null);



  const [loading, setLoading] = useState(true);



  const [refreshing, setRefreshing] = useState(false);



  const [errorMessage, setErrorMessage] = useState("");



  const [activeTab, setActiveTab] = useState<Tab>("Home");



  const loadDashboard = useCallback(async () => {



    setErrorMessage("");



    try {



      const {



        data: { user },



        error: authError,



      } = await supabase.auth.getUser();



      if (authError || !user) {



        router.replace("/teacher/teacher-login" as never);



        return;



      }



      const { data: member, error: memberError } = await supabase



        .from("institute_team_members")



        .select(



          "id,user_id,institute_id,full_name,phone,role,permissions,is_active,staff_id",



        )



        .eq("user_id", user.id)



        .eq("role", "teacher")



        .eq("is_active", true)



        .maybeSingle();



      if (memberError) throw memberError;



      if (!member) {



        setTeacher(null);



        setErrorMessage(



          "No active teacher profile is linked to this login. Please contact your institute owner.",



        );



        return;



      }



      const { data: instituteDataRaw, error: instituteError } = await supabase



        .from("institutes")



        .select("id,name,logo_url,slogan")



        .eq("id", member.institute_id)



        .maybeSingle();



      if (instituteError) throw instituteError;



      const instituteData = (instituteDataRaw ?? null) as Institute | null;



      // Profile details intentionally do not display staff or institute records.



      // Keep the account photo sourced from the linked staff photo path only.



      let photoPath: string | null = null;



      if (member.staff_id) {



        const { data: photoRecord, error: photoError } = await supabase



          .from("institute_staff")



          .select("photo_path")



          .eq("id", member.staff_id)



          .eq("institute_id", member.institute_id)



          .maybeSingle();



        if (photoError)



          console.warn(



            "[teacher-dashboard] Could not load teacher photo:",



            photoError.message,



          );



        photoPath = photoRecord?.photo_path ?? null;



      }



      const [logoUrl, photoUrl] = await Promise.all([



        findInstituteLogo(member.institute_id, instituteData?.logo_url ?? null),



        resolveStoredImage(photoPath, "staff-photos"),



      ]);



      setTeacher(member as Teacher);



      setInstitute(instituteData);



      setInstituteLogo(logoUrl);



      setTeacherPhoto(photoUrl);



    } catch (error) {



      console.error("[teacher-dashboard] Load failed:", error);



      setErrorMessage(



        error instanceof Error



          ? error.message



          : "Unable to load the dashboard.",



      );



    } finally {



      setLoading(false);



      setRefreshing(false);



    }



  }, []);



  useEffect(() => {



    void loadDashboard();



  }, [loadDashboard]);



  const changeTeacherPhoto = async () => {
    if (!teacher?.staff_id) {
      Alert.alert(
        "Profile not linked",
        "Your teacher login is not linked to a staff profile. Please contact your institute owner.",
      );
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission required",
          "Allow photo-library access to choose a profile picture.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      if (!asset.base64) {
        throw new Error("The selected image could not be read. Please choose another image.");
      }

      setUploadingPhoto(true);

      // Read the currently stored path before changing the database reference.
      // Keep the old object until the new upload and profile update both succeed.
      const { data: currentStaff, error: currentStaffError } = await supabase
        .from("institute_staff")
        .select("photo_path")
        .eq("id", teacher.staff_id)
        .eq("institute_id", teacher.institute_id)
        .maybeSingle();

      if (currentStaffError) throw currentStaffError;
      if (!currentStaff) {
        throw new Error("Your linked staff profile could not be found.");
      }

      const previousPhotoPath = currentStaff.photo_path as string | null;

      // Convert the picker's base64 image directly to bytes. Avoid Response.blob(),
      // which can create invalid/inefficient uploads in some React Native versions.
      const binary = globalThis.atob(asset.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }

      // ImagePicker's edited image is generally JPEG; use its MIME type when available.
      const mimeType = (asset.mimeType || "image/jpeg").toLowerCase();
      const extension =
        mimeType === "image/png"
          ? "png"
          : mimeType === "image/webp"
            ? "webp"
            : "jpg";
      const contentType =
        extension === "png"
          ? "image/png"
          : extension === "webp"
            ? "image/webp"
            : "image/jpeg";

      // Use a unique object path so the app cannot keep showing a cached old image.
      const objectPath = `${teacher.institute_id}/${teacher.staff_id}/profile-${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("staff-photos")
        .upload(objectPath, bytes, {
          upsert: false,
          contentType,
          cacheControl: "0",
        });

      if (uploadError) throw uploadError;

      const { data: updatedRows, error: updateError } = await supabase
        .from("institute_staff")
        .update({ photo_path: objectPath })
        .eq("id", teacher.staff_id)
        .eq("institute_id", teacher.institute_id)
        .select("id,photo_path");

      if (updateError) throw updateError;
      if (!updatedRows?.length) {
        throw new Error(
          "The image uploaded, but the staff profile was not updated. Check the institute_staff UPDATE policy.",
        );
      }

      const { data: signedData, error: signedError } = await supabase.storage
        .from("staff-photos")
        .createSignedUrl(objectPath, 60 * 60);

      if (signedError || !signedData?.signedUrl) {
        throw signedError || new Error("The image uploaded, but its preview URL could not be created.");
      }

      const freshPhotoUrl = `${signedData.signedUrl}${signedData.signedUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
      setTeacherPhoto(freshPhotoUrl);
      setPhotoModalVisible(false);

      // Delete the old object only after the database points to the new image.
      // Support either a bucket-relative path or a Supabase Storage URL.
      let previousObjectPath: string | null = null;
      if (previousPhotoPath?.trim()) {
        const previous = previousPhotoPath.trim();
        const publicMarker = "/storage/v1/object/public/staff-photos/";
        const signMarker = "/storage/v1/object/sign/staff-photos/";
        const authMarker = "/storage/v1/object/authenticated/staff-photos/";

        if (previous.includes(publicMarker)) {
          previousObjectPath = previous.split(publicMarker)[1]?.split("?")[0] ?? null;
        } else if (previous.includes(signMarker)) {
          previousObjectPath = previous.split(signMarker)[1]?.split("?")[0] ?? null;
        } else if (previous.includes(authMarker)) {
          previousObjectPath = previous.split(authMarker)[1]?.split("?")[0] ?? null;
        } else if (!/^https?:\/\//i.test(previous) && !previous.startsWith("data:")) {
          previousObjectPath = previous.replace(/^staff-photos\//, "").replace(/^\/+/, "").split("?")[0];
        }

        if (previousObjectPath) {
          try {
            previousObjectPath = previousObjectPath
              .split("/")
              .map((part) => decodeURIComponent(part))
              .join("/");
          } catch {
            // Keep the original path if it contains an invalid escape sequence.
          }
        }
      }

      let cleanupWarning = "";
      if (previousObjectPath && previousObjectPath !== objectPath) {
        // photo_path is the authoritative pointer for this staff row. Older
        // uploads may use a different folder convention, so do not assume the
        // previous object must be inside institute_id/staff_id/.
        const { data: removedObjects, error: removeError } = await supabase.storage
          .from("staff-photos")
          .remove([previousObjectPath]);

        if (removeError) {
          console.warn(
            "[teacher-dashboard] New photo saved, but old photo could not be deleted:",
            { path: previousObjectPath, message: removeError.message },
          );
          cleanupWarning = " The previous photo could not be deleted. Check Storage DELETE policies for this object path.";
        } else if (!removedObjects?.length) {
          console.warn(
            "[teacher-dashboard] Storage did not confirm deletion of the previous photo:",
            previousObjectPath,
          );
          cleanupWarning = " Supabase did not confirm deletion of the previous photo. Check the stored path and Storage permissions.";
        }
      } else if (previousPhotoPath?.trim() && !previousObjectPath) {
        console.warn(
          "[teacher-dashboard] Could not resolve previous photo_path to a staff-photos object path:",
          previousPhotoPath,
        );
        cleanupWarning = " The old photo path could not be recognized, so the old file was not deleted.";
      }

      Alert.alert(
        "Photo updated",
        `Your profile photo has been updated successfully.${cleanupWarning}`,
      );
    } catch (error) {
      console.error("[teacher-dashboard] Photo update failed:", error);
      const message =
        error instanceof Error ? error.message : "Please try again.";
      Alert.alert("Unable to update photo", message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const logout = () => {



    Alert.alert(



      "Sign out",



      "Do you want to sign out of your teacher account?",



      [



        { text: "Cancel", style: "cancel" },



        {



          text: "Sign out",



          style: "destructive",



          onPress: async () => {



            const { error } = await supabase.auth.signOut();



            if (error) {



              Alert.alert("Unable to sign out", error.message);



              return;



            }



            router.replace("/" as never);



          },



        },



      ],



    );



  };



  const visibleModules = MODULES.filter(



    (item) =>



      !item.permission || teacher?.permissions?.[item.permission] === true,



  );



  const openModule = (item: ModuleItem) => {



    if (item.title === "Attendance") {



      router.push("/teacher/attendance" as never);



      return;



    }



    if (item.title === "Timetable") {



      router.push("/teacher/timetable" as never);



      return;



    }



    if (item.title === "Students") {



      router.push("/teacher/students" as never);



      return;



    }



    if (item.title === "Exams") {



      router.push("/teacher/exams" as never);



      return;



    }



    if (item.title === "Books") {



      router.push("/teacher/books" as never);



      return;



    }



    if (item.title === "Teachers") {



      router.push("/teacher/teachers" as never);



      return;



    }



    if (item.title === "My salary") {



      router.push("/teacher/mysalary" as never);



      return;



    }



    if (item.title === "My Attendance") {



      router.push("/teacher/myattendance" as never);



      return;



    }



    Alert.alert(



      item.title,



      `${item.subtitle} will appear here when its module screen is connected.`,



    );



  };



  if (loading) {



    return (



      <View style={styles.center}>



        <StatusBar barStyle="dark-content" backgroundColor={BG} />



        <ActivityIndicator size="large" color={BLUE} />



        <Text style={styles.loadingText}>Preparing your workspace…</Text>



      </View>



    );



  }



  if (!teacher) {



    return (



      <View style={[styles.center, styles.errorScreen]}>



        <Feather name="alert-circle" size={44} color="#D65B69" />



        <Text style={styles.errorTitle}>Dashboard unavailable</Text>



        <Text style={styles.errorText}>



          {errorMessage || "Your teacher profile could not be loaded."}



        </Text>



        <TouchableOpacity



          style={styles.primaryButton}



          onPress={() => {



            setLoading(true);



            void loadDashboard();



          }}



        >



          <Text style={styles.primaryButtonText}>Try again</Text>



        </TouchableOpacity>



        <TouchableOpacity



          style={styles.textButton}



          onPress={() => router.replace("/teacher/teacher-login" as never)}



        >



          <Text style={styles.textButtonLabel}>Back to login</Text>



        </TouchableOpacity>



      </View>



    );



  }



  const firstName = teacher.full_name.trim().split(/\s+/)[0] || "Teacher";



  const today = new Date().toLocaleDateString("en-IN", {



    weekday: "long",



    day: "numeric",



    month: "long",



  });



  const columns = 3;



  const gridGap = 12;



  const cardWidth = (width - 40 - gridGap * (columns - 1)) / columns;



  const renderBottomTab = (tab: Tab, icon: keyof typeof Feather.glyphMap) => {



    const selected = activeTab === tab;



    return (



      <TouchableOpacity



        key={tab}



        style={styles.tabButton}



        onPress={() => {



          if (tab === "Classes") {



            router.push("/teacher/students" as never);



            return;



          }



          if (tab === "Attendance") {



            router.push("/teacher/attendance" as never);



            return;



          }



          if (tab === "Timetable") {



            router.push("/teacher/timetable" as never);



            return;



          }



          setActiveTab(tab);



        }}



        accessibilityRole="button"



        accessibilityState={{ selected }}



      >



        <View



          style={[styles.tabIconWrap, selected && styles.tabIconWrapActive]}



        >



          <Feather name={icon} size={20} color={selected ? BLUE : MUTED} />



        </View>



        <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>



          {tab}



        </Text>



      </TouchableOpacity>



    );



  };



  return (



    <View style={styles.screen}>



      <StatusBar barStyle="light-content" backgroundColor={PURPLE_DARK} />



      {activeTab === "Home" ? (



        <ScrollView



          showsVerticalScrollIndicator={false}



          refreshControl={



            <RefreshControl



              refreshing={refreshing}



              onRefresh={() => {



                setRefreshing(true);



                void loadDashboard();



              }}



              tintColor={BLUE}



            />



          }



          contentContainerStyle={{ paddingBottom: 22 }}



        >



          <LinearGradient



            colors={["#611CD0", "#44109D", "#4C02F7"]}



            start={{ x: 0, y: 0 }}



            end={{ x: 1, y: 1 }}



            style={[



              styles.header,



              { paddingTop: Math.max(insets.top, 12) + 12 },



            ]}



          >



            <View style={styles.headerTop}>



              <View style={styles.brand}>



                <View style={styles.brandLogo}>



                  {instituteLogo ? (



                    <Image



                      source={{ uri: instituteLogo }}



                      style={styles.logoImage}



                      resizeMode="contain"



                    />



                  ) : (



                    <Feather name="book-open" size={22} color={NAVY} />



                  )}



                </View>



                <View style={styles.brandTextWrap}>



                  <Text style={styles.brandName} numberOfLines={1}>



                    {institute?.name?.trim() || "Your Institute"}



                  </Text>



                  <Text style={styles.brandCaption}>TEACHER PORTAL</Text>



                </View>



              </View>



              <TouchableOpacity



                style={styles.headerButton}



                onPress={logout}



                accessibilityLabel="Sign out"



              >



                <Feather name="log-out" size={19} color={WHITE} />



              </TouchableOpacity>



            </View>



            <View style={styles.welcomeRow}>



              <View style={styles.welcomeTextWrap}>



                <Text style={styles.eyebrow}>YOUR TEACHING SPACE</Text>



                <Text style={styles.greeting}>Hello, {firstName} 👋</Text>



                <Text style={styles.headerSubtitle}>



                  Let’s make today a great learning day.



                </Text>



              </View>



              <TouchableOpacity style={styles.teacherPhotoFrame} onPress={() => setPhotoModalVisible(true)} activeOpacity={0.82} accessibilityRole="button" accessibilityLabel="View or change profile photo">



                {teacherPhoto ? (



                  <Image



                    source={{ uri: teacherPhoto }}



                    style={styles.teacherPhoto}



                  />



                ) : (



                  <View style={styles.teacherPhotoFallback}>



                    <Text style={styles.teacherInitials}>



                      {teacher.full_name



                        .trim()



                        .split(/\s+/)



                        .slice(0, 2)



                        .map((part) => part[0]?.toUpperCase())



                        .join("")}



                    </Text>



                  </View>



                )}





                <View style={styles.photoEditBadge}>

                  <Feather name="camera" size={13} color={WHITE} />

                </View>

              </TouchableOpacity>

            </View>

            <View style={styles.datePill}>



              <Feather name="calendar" size={14} color="#DDE9FA" />



              <Text style={styles.dateText}>{today}</Text>



            </View>



            <View style={styles.profileCard}>



              <View style={styles.profileTextWrap}>



                <Text style={styles.profileName} numberOfLines={1}>



                  {teacher.full_name}



                </Text>



                <Text style={styles.profilePhone}>



                  {teacher.phone



                    ? `+91 ${teacher.phone}`



                    : "Mobile number not added"}



                </Text>



              </View>



              <View style={styles.activeBadge}>



                <View style={styles.activeDot} />



                <Text style={styles.activeText}>Active</Text>



              </View>



            </View>



          </LinearGradient>



          <View style={styles.content}>



            <View style={styles.sectionHeading}>



              <View style={{ flex: 1 }}>



                <Text style={styles.sectionTitle}>Quick access</Text>



                <Text style={styles.sectionSubtitle}>



                  Your daily teaching tools



                </Text>



              </View>



              <Text style={styles.moduleCount}>



                {visibleModules.length} tools



              </Text>



            </View>



            <View style={styles.moduleGrid}>



              {visibleModules.map((item) => (



                <TouchableOpacity



                  key={item.title}



                  style={[styles.moduleCard, { width: cardWidth }]}



                  activeOpacity={0.72}



                  onPress={() => openModule(item)}



                  accessibilityRole="button"



                >



                  <View



                    style={[



                      styles.moduleIcon,



                      { backgroundColor: `${item.color}18` },



                    ]}



                  >



                    <Feather name={item.icon} size={22} color={item.color} />



                  </View>



                  <Text style={styles.moduleTitle} numberOfLines={1}>



                    {item.title}



                  </Text>



                  <Text style={styles.moduleSubtitle} numberOfLines={2}>



                    {item.subtitle}



                  </Text>



                  <View style={styles.moduleArrow}>



                    <Feather name="arrow-up-right" size={14} color="#8A98A9" />



                  </View>



                </TouchableOpacity>



              ))}



            </View>



            <TouchableOpacity



              style={styles.noticeCard}



              onPress={() =>



                Alert.alert(



                  "Institute updates",



                  "Notices will be shown here when the notices module is connected.",



                )



              }



            >



              <View style={styles.noticeIcon}>



                <Feather name="bell" size={19} color={BLUE} />



              </View>



              <View style={styles.noticeContent}>



                <Text style={styles.noticeTitle}>Stay in the loop</Text>



                <Text style={styles.noticeText}>



                  Keep an eye on institute announcements and updates.



                </Text>



              </View>



              <Feather name="chevron-right" size={20} color={MUTED} />



            </TouchableOpacity>



          </View>



        </ScrollView>



      ) : (



        <View



          style={[



            styles.secondaryPage,



            { paddingTop: Math.max(insets.top, 16) + 18 },



          ]}



        >



          {activeTab === "Profile" ? (



            <>



              <View style={styles.profilePageHeading}>



                <View style={styles.profileHeadingIcon}>



                  <Feather name="user" size={20} color={BLUE} />



                </View>



                <View style={{ flex: 1 }}>



                  <Text style={styles.secondaryEyebrow}>YOUR ACCOUNT</Text>



                  <Text style={styles.secondaryTitle}>My Profile</Text>



                  <Text style={styles.profilePageSubtitle}>



                    Your teacher account information



                  </Text>



                </View>



              </View>



              <ScrollView



                style={{ flex: 1, width: "100%" }}



                contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}



                showsVerticalScrollIndicator



                nestedScrollEnabled



                keyboardShouldPersistTaps="handled"



              >



                <View style={styles.profileHeroCard}>



                  <View style={styles.profileAvatarRing}>



                    {teacherPhoto ? (



                      <Image



                        source={{ uri: teacherPhoto }}



                        style={styles.profileLargePhoto}



                      />



                    ) : (



                      <View style={styles.profileLargeFallback}>



                        <Text style={styles.profileLargeInitials}>



                          {teacher.full_name



                            .trim()



                            .split(/\s+/)



                            .slice(0, 2)



                            .map((p) => p[0]?.toUpperCase())



                            .join("")}



                        </Text>



                      </View>



                    )}



                  </View>



                  <Text style={styles.profileDetailName}>



                    {teacher.full_name}



                  </Text>



                  <View style={styles.profileRolePill}>



                    <Feather name="book-open" size={13} color={BLUE} />



                    <Text style={styles.profileRoleText}>Teacher</Text>



                  </View>



                  <Text style={styles.profileHeroCaption}>



                    GyanDeep Academy Teacher Portal



                  </Text>



                </View>



                <View style={styles.profileInfoCard}>



                  <View style={styles.profileInfoHeading}>



                    <View style={styles.profileInfoHeadingIcon}>



                      <Feather name="user-check" size={17} color={BLUE} />



                    </View>



                    <View>



                      <Text style={styles.profileInfoTitle}>



                        Personal information



                      </Text>



                      <Text style={styles.profileInfoSubtitle}>



                        Basic account details



                      </Text>



                    </View>



                  </View>



                  <View style={styles.profileDetailRow}>



                    <View style={styles.profileFieldIcon}>



                      <Feather name="user" size={16} color={MUTED} />



                    </View>



                    <View style={styles.profileFieldText}>



                      <Text style={styles.profileDetailLabel}>Full name</Text>



                      <Text style={styles.profileDetailValue}>



                        {teacher.full_name || "Not provided"}



                      </Text>



                    </View>



                  </View>



                  <View style={styles.profileDetailRow}>



                    <View style={styles.profileFieldIcon}>



                      <Feather name="phone" size={16} color={MUTED} />



                    </View>



                    <View style={styles.profileFieldText}>



                      <Text style={styles.profileDetailLabel}>



                        Phone number



                      </Text>



                      <Text style={styles.profileDetailValue}>



                        {teacher.phone || "Not provided"}



                      </Text>



                    </View>



                  </View>



                  <View style={styles.profileDetailRow}>



                    <View style={styles.profileFieldIcon}>



                      <Feather name="briefcase" size={16} color={MUTED} />



                    </View>



                    <View style={styles.profileFieldText}>



                      <Text style={styles.profileDetailLabel}>Role</Text>



                      <Text style={styles.profileDetailValue}>



                        {formatFieldValue(teacher.role)}



                      </Text>



                    </View>



                  </View>



                </View>



                <View style={styles.profileInfoCard}>



                  <View style={styles.profileInfoHeading}>



                    <View style={styles.profileInfoHeadingIcon}>



                      <Feather name="shield" size={17} color="#159A82" />



                    </View>



                    <View>



                      <Text style={styles.profileInfoTitle}>



                        Access & permissions



                      </Text>



                      <Text style={styles.profileInfoSubtitle}>



                        Modules available to your account



                      </Text>



                    </View>



                  </View>



                  {teacher.permissions &&



                  Object.entries(teacher.permissions).some(



                    ([, allowed]) => allowed === true,



                  ) ? (



                    <View style={styles.permissionChips}>



                      {Object.entries(teacher.permissions)



                        .filter(([, allowed]) => allowed === true)



                        .map(([key]) => (



                          <View key={key} style={styles.permissionChip}>



                            <Feather



                              name="check-circle"



                              size={13}



                              color="#16845D"



                            />



                            <Text style={styles.permissionChipText}>



                              {formatFieldLabel(key)}



                            </Text>



                          </View>



                        ))}



                    </View>



                  ) : (



                    <Text style={styles.profileNoDetails}>



                      No additional module permissions are listed for this



                      account.



                    </Text>



                  )}



                </View>



                <TouchableOpacity



                  style={styles.profileSignOutButton}



                  onPress={logout}



                  activeOpacity={0.8}



                >



                  <Feather name="log-out" size={18} color="#C94F5B" />



                  <Text style={styles.signOutText}>Sign out of account</Text>



                  <Feather name="chevron-right" size={18} color="#C94F5B" />



                </TouchableOpacity>



              </ScrollView>



            </>



          ) : (



            <>



              <Text style={styles.secondaryEyebrow}>TEACHER PORTAL</Text>



              <Text style={styles.secondaryTitle}>{activeTab}</Text>



              <Text style={styles.secondarySubtitle}>



                {activeTab === "Attendance"



                  ? "Manage attendance for your classes."



                  : "Choose a section from the bottom navigation."}



              </Text>



              {activeTab === "Attendance" ? (



                <TouchableOpacity



                  style={styles.primaryButton}



                  onPress={() => router.push("/teacher/attendance" as never)}



                >



                  <Feather name="check-square" size={18} color={WHITE} />



                  <Text style={styles.primaryButtonText}>Open attendance</Text>



                </TouchableOpacity>



              ) : null}



            </>



          )}



        </View>



      )}



      <Modal visible={photoModalVisible} transparent animationType="fade"

        onRequestClose={() => !uploadingPhoto && setPhotoModalVisible(false)}>

        <Pressable style={styles.photoModalBackdrop} onPress={() => !uploadingPhoto && setPhotoModalVisible(false)}>

          <Pressable style={styles.photoModalCard} onPress={() => {}}>

            <TouchableOpacity style={styles.photoModalClose}

              onPress={() => !uploadingPhoto && setPhotoModalVisible(false)} disabled={uploadingPhoto}

              accessibilityLabel="Close photo preview">

              <Feather name="x" size={21} color={NAVY} />

            </TouchableOpacity>

            <LinearGradient colors={["#611CD0", "#44109D", "#4C02F7"]}

              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.photoModalImageWrap}>

              {teacherPhoto ? <Image key={teacherPhoto} source={{ uri: teacherPhoto }} style={styles.photoModalImage} resizeMode="cover" /> :

                <View style={styles.photoModalFallback}>

                  <Text style={styles.photoModalInitials}>{teacher.full_name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")}</Text>

                </View>}

            </LinearGradient>

            <Text style={styles.photoModalTitle}>{teacher.full_name}</Text>

            <Text style={styles.photoModalSubtitle}>Teacher profile photo</Text>

            <TouchableOpacity style={[styles.changePhotoButton, uploadingPhoto && { opacity: 0.7 }]}

              onPress={() => void changeTeacherPhoto()} disabled={uploadingPhoto} activeOpacity={0.85}>

              {uploadingPhoto ? <ActivityIndicator color={WHITE} /> : <>

                <Feather name="camera" size={17} color={WHITE} />

                <Text style={styles.changePhotoButtonText}>Change photo</Text>

              </>}

            </TouchableOpacity>

            <Text style={styles.photoModalHint}>Choose and crop a new photo. It will replace your current profile image.</Text>

          </Pressable>

        </Pressable>

      </Modal>



      <View



        style={[



          styles.bottomNav,



          { paddingBottom: Math.max(insets.bottom, 8) },



        ]}



      >



        {renderBottomTab("Home", "home")}



        {renderBottomTab("Classes", "users")}



        {renderBottomTab("Attendance", "check-square")}



        {renderBottomTab("Timetable", "calendar")}



        {renderBottomTab("Profile", "user")}



      </View>



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



    padding: 28,



  },



  errorScreen: { gap: 14 },



  loadingText: { color: MUTED, marginTop: 14, fontSize: 14 },



  errorTitle: {



    color: NAVY,



    fontSize: 23,



    fontWeight: "800",



    textAlign: "center",



  },



  errorText: {



    color: MUTED,



    fontSize: 14,



    lineHeight: 21,



    textAlign: "center",



  },



  primaryButton: {



    backgroundColor: NAVY,



    paddingHorizontal: 22,



    paddingVertical: 14,



    borderRadius: 14,



    marginTop: 10,



    flexDirection: "row",



    alignItems: "center",



    justifyContent: "center",



    gap: 9,



  },



  primaryButtonText: { color: WHITE, fontWeight: "800", fontSize: 14 },



  textButton: { padding: 10 },



  textButtonLabel: { color: BLUE, fontWeight: "700" },



  header: {



    paddingHorizontal: 20,



    paddingBottom: 24,



    borderBottomLeftRadius: 30,



    borderBottomRightRadius: 30,



    overflow: "hidden",



  },



  headerTop: {



    flexDirection: "row",



    alignItems: "center",



    justifyContent: "space-between",



  },



  brand: {



    flex: 1,



    flexDirection: "row",



    alignItems: "center",



    gap: 10,



    marginRight: 12,



  },



  brandLogo: {



    width: 44,



    height: 44,



    borderRadius: 14,



    backgroundColor: WHITE,



    alignItems: "center",



    justifyContent: "center",



    overflow: "hidden",



  },



  logoImage: { width: 38, height: 38 },



  brandTextWrap: { flex: 1 },



  brandName: { color: WHITE, fontSize: 15, fontWeight: "900" },



  brandCaption: {



    color: "#B9C9DC",



    fontSize: 9,



    fontWeight: "800",



    letterSpacing: 1.6,



    marginTop: 4,



  },



  headerButton: {



    width: 42,



    height: 42,



    borderRadius: 14,



    borderWidth: 1,



    borderColor: "#526174",



    alignItems: "center",



    justifyContent: "center",



  },



  welcomeRow: {



    flexDirection: "row",



    alignItems: "center",



    justifyContent: "space-between",



    marginTop: 25,



    gap: 12,



  },



  welcomeTextWrap: { flex: 1 },



  eyebrow: {



    color: "#AFC8EA",



    fontSize: 9,



    fontWeight: "900",



    letterSpacing: 1.5,



  },



  greeting: { color: WHITE, fontSize: 22, fontWeight: "900", marginTop: 7 },



  headerSubtitle: {



    color: "#C6D3E0",



    fontSize: 12,



    lineHeight: 18,



    marginTop: 6,



    maxWidth: 245,



  },



  teacherPhotoFrame: {



    width: 100,



    height: 100,



    borderRadius: 23,



    borderWidth: 2,



    borderColor: "#C4B5FD",



    overflow: "hidden",



    backgroundColor: "#E0EBFA",



  },



  teacherPhoto: { width: "100%", height: "100%" },



  teacherPhotoFallback: {



    flex: 1,



    alignItems: "center",



    justifyContent: "center",



  },



  teacherInitials: { color: BLUE, fontSize: 22, fontWeight: "900" },



  datePill: {



    alignSelf: "flex-start",



    flexDirection: "row",



    alignItems: "center",



    gap: 7,



    backgroundColor: "#5B2AB8",



    paddingHorizontal: 11,



    paddingVertical: 8,



    borderRadius: 12,



    marginTop: 18,



  },



  dateText: { color: "#DDE9FA", fontSize: 11, fontWeight: "700" },



  profileCard: {



    backgroundColor: "#FFFFFF",



    borderRadius: 17,



    paddingHorizontal: 15,



    paddingVertical: 13,



    marginTop: 17,



    flexDirection: "row",



    alignItems: "center",



    gap: 10,



  },



  profileTextWrap: { flex: 1 },



  profileName: { color: NAVY, fontSize: 14, fontWeight: "900" },



  profilePhone: { color: MUTED, fontSize: 12, marginTop: 5 },



  activeBadge: {



    flexDirection: "row",



    alignItems: "center",



    gap: 6,



    backgroundColor: "#E7F8F0",



    paddingHorizontal: 9,



    paddingVertical: 6,



    borderRadius: 10,



  },



  activeDot: {



    width: 6,



    height: 6,



    borderRadius: 3,



    backgroundColor: "#159A68",



  },



  activeText: { color: "#16845D", fontSize: 10, fontWeight: "800" },



  content: { paddingHorizontal: 20, paddingTop: 25 },



  sectionHeading: {



    flexDirection: "row",



    alignItems: "center",



    justifyContent: "space-between",



    marginBottom: 15,



    gap: 10,



  },



  sectionTitle: {



    color: "#241344",



    fontSize: 21,



    fontWeight: "900",



    letterSpacing: -0.3,



  },



  sectionSubtitle: { color: MUTED, fontSize: 12, marginTop: 5 },



  moduleCount: {



    color: PURPLE,



    backgroundColor: "#E9E0FF",



    paddingHorizontal: 11,



    paddingVertical: 8,



    borderRadius: 12,



    fontSize: 11,



    fontWeight: "900",



  },



  moduleGrid: {



    flexDirection: "row",



    flexWrap: "wrap",



    justifyContent: "flex-start",



    gap: 12,



  },



  moduleCard: {



    minHeight: 164,



    backgroundColor: WHITE,



    borderRadius: 22,



    borderWidth: 1,



    borderColor: "#E7E0FA",



    paddingHorizontal: 13,



    paddingTop: 15,



    paddingBottom: 14,



    overflow: "hidden",



    shadowColor: "#4C02F7",



    shadowOpacity: 0.08,



    shadowRadius: 14,



    shadowOffset: { width: 0, height: 5 },



    elevation: 4,



  },



  moduleIcon: {



    width: 46,



    height: 46,



    borderRadius: 16,



    alignItems: "center",



    justifyContent: "center",



    marginBottom: 13,



    borderWidth: 1,



    borderColor: "#F0EBFF",



  },



  moduleTitle: {



    color: "#241344",



    fontSize: 13,



    fontWeight: "900",



    paddingRight: 10,



    letterSpacing: 0.1,



  },



  moduleSubtitle: {



    color: MUTED,



    fontSize: 10,



    lineHeight: 15,



    marginTop: 6,



    paddingRight: 1,



  },



  moduleArrow: {



    position: "absolute",



    top: 12,



    right: 11,



    width: 27,



    height: 27,



    borderRadius: 10,



    backgroundColor: "#F3EFFF",



    alignItems: "center",



    justifyContent: "center",



  },



  noticeCard: {



    flexDirection: "row",



    alignItems: "center",



    backgroundColor: "#F0EBFF",



    borderRadius: 17,



    padding: 14,



    marginTop: 19,



    gap: 11,



  },



  noticeIcon: {



    width: 37,



    height: 37,



    borderRadius: 12,



    backgroundColor: WHITE,



    alignItems: "center",



    justifyContent: "center",



  },



  noticeContent: { flex: 1 },



  noticeTitle: { color: NAVY, fontSize: 13, fontWeight: "900" },



  noticeText: { color: "#586D85", fontSize: 11, lineHeight: 16, marginTop: 4 },



  bottomNav: {



    flexDirection: "row",



    alignItems: "center",



    justifyContent: "space-around",



    backgroundColor: WHITE,



    paddingTop: 9,



    borderTopWidth: 1,



    borderTopColor: BORDER,



    shadowColor: "#1D2D44",



    shadowOpacity: 0.06,



    shadowRadius: 10,



    shadowOffset: { width: 0, height: -3 },



    elevation: 12,



  },



  tabButton: {



    flex: 1,



    alignItems: "center",



    justifyContent: "center",



    gap: 3,



    paddingHorizontal: 2,



  },



  tabIconWrap: {



    width: 39,



    height: 29,



    alignItems: "center",



    justifyContent: "center",



    borderRadius: 11,



  },



  tabIconWrapActive: { backgroundColor: "#EDE7FF" },



  tabLabel: { color: MUTED, fontSize: 9, fontWeight: "700" },



  tabLabelActive: { color: PURPLE, fontWeight: "900" },



  secondaryPage: { flex: 1, paddingHorizontal: 22, backgroundColor: BG },



  secondaryEyebrow: {



    color: BLUE,



    fontSize: 11,



    fontWeight: "900",



    letterSpacing: 1,



  },



  secondaryTitle: {



    color: NAVY,



    fontSize: 29,



    fontWeight: "900",



    marginTop: 8,



  },



  secondarySubtitle: {



    color: MUTED,



    fontSize: 14,



    lineHeight: 21,



    marginTop: 10,



  },



  profilePageHeading: {



    flexDirection: "row",



    alignItems: "center",



    gap: 13,



    marginBottom: 18,



  },



  profileHeadingIcon: {



    width: 48,



    height: 48,



    borderRadius: 16,



    backgroundColor: "#EDE7FF",



    alignItems: "center",



    justifyContent: "center",



  },



  profilePageSubtitle: { color: MUTED, fontSize: 12, marginTop: 5 },



  profileHeroCard: {



    backgroundColor: PURPLE_DARK,



    borderRadius: 24,



    alignItems: "center",



    paddingHorizontal: 22,



    paddingVertical: 25,



    marginBottom: 15,



    overflow: "hidden",



  },



  profileAvatarRing: {



    padding: 4,



    borderRadius: 35,



    borderWidth: 2,



    borderColor: "#C4B5FD",



    backgroundColor: "#5B2AB8",



  },



  profileHeroCaption: { color: "#C6D3E0", fontSize: 11, marginTop: 8 },



  profileRolePill: {



    flexDirection: "row",



    alignItems: "center",



    gap: 6,



    backgroundColor: "#EDE7FF",



    paddingHorizontal: 11,



    paddingVertical: 6,



    borderRadius: 20,



    marginTop: 10,



  },



  profileRoleText: { color: BLUE, fontSize: 11, fontWeight: "900" },



  profileInfoCard: {



    backgroundColor: WHITE,



    borderRadius: 20,



    borderWidth: 1,



    borderColor: BORDER,



    paddingHorizontal: 16,



    paddingVertical: 17,



    marginBottom: 14,



  },



  profileInfoHeading: {



    flexDirection: "row",



    alignItems: "center",



    gap: 11,



    marginBottom: 8,



  },



  profileInfoHeadingIcon: {



    width: 36,



    height: 36,



    borderRadius: 12,



    backgroundColor: "#EDE7FF",



    alignItems: "center",



    justifyContent: "center",



  },



  profileInfoTitle: { color: NAVY, fontSize: 14, fontWeight: "900" },



  profileInfoSubtitle: { color: MUTED, fontSize: 11, marginTop: 3 },



  profileFieldIcon: {



    width: 34,



    height: 34,



    borderRadius: 11,



    backgroundColor: "#F2F5F9",



    alignItems: "center",



    justifyContent: "center",



  },



  profileFieldText: { flex: 1, gap: 4 },



  permissionChips: {



    flexDirection: "row",



    flexWrap: "wrap",



    gap: 8,



    marginTop: 7,



  },



  permissionChip: {



    flexDirection: "row",



    alignItems: "center",



    gap: 6,



    backgroundColor: "#EAF8F1",



    borderRadius: 12,



    paddingHorizontal: 10,



    paddingVertical: 8,



  },



  permissionChipText: { color: "#167650", fontSize: 11, fontWeight: "800" },



  profileSignOutButton: {



    flexDirection: "row",



    alignItems: "center",



    justifyContent: "space-between",



    gap: 10,



    backgroundColor: "#FFF1F2",



    borderRadius: 16,



    borderWidth: 1,



    borderColor: "#F8DADD",



    paddingHorizontal: 16,



    paddingVertical: 15,



    marginTop: 2,



  },



  profileLargePhoto: {



    width: 90,



    height: 90,



    borderRadius: 30,



    backgroundColor: "#E0EBFA",



  },



  profileLargeFallback: {



    width: 90,



    height: 90,



    borderRadius: 30,



    backgroundColor: "#E0EBFA",



    alignItems: "center",



    justifyContent: "center",



  },



  profileLargeInitials: { color: BLUE, fontSize: 26, fontWeight: "900" },



  profileDetailName: {



    color: WHITE,



    fontSize: 19,



    fontWeight: "900",



    marginTop: 14,



  },



  profileDetailPhone: { color: MUTED, fontSize: 13, marginTop: 6 },



  profileDetailRow: {



    flexDirection: "row",



    alignItems: "center",



    gap: 11,



    paddingVertical: 12,



    borderBottomWidth: 1,



    borderBottomColor: BORDER,



  },



  profileDetailLabel: { color: MUTED, fontSize: 11, fontWeight: "600" },



  profileDetailValue: { color: NAVY, fontSize: 13, fontWeight: "800" },



  profileNoDetails: {



    color: MUTED,



    fontSize: 12,



    lineHeight: 18,



    marginVertical: 8,



  },



  signOutText: { color: "#C94F5B", fontSize: 14, fontWeight: "800" },





  photoEditBadge: {

    position: "absolute", right: 5, bottom: 5, width: 28, height: 28,

    borderRadius: 10, backgroundColor: PURPLE, borderWidth: 2, borderColor: WHITE,

    alignItems: "center", justifyContent: "center",

  },

  photoModalBackdrop: {

    flex: 1, backgroundColor: "rgba(24, 12, 48, 0.68)",

    alignItems: "center", justifyContent: "center", padding: 24,

  },

  photoModalCard: {

    width: "100%", maxWidth: 360, borderRadius: 28, backgroundColor: WHITE,

    paddingHorizontal: 22, paddingTop: 26, paddingBottom: 22, alignItems: "center",

    borderWidth: 1, borderColor: "#E7E0FA", shadowColor: "#1B0B39",

    shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12,

  },

  photoModalClose: {

    position: "absolute", top: 12, right: 12, zIndex: 2, width: 36, height: 36,

    borderRadius: 12, backgroundColor: "#F3F0FC", alignItems: "center", justifyContent: "center",

  },

  photoModalImageWrap: {

    width: 190, height: 190, borderRadius: 32, padding: 4,

    alignItems: "center", justifyContent: "center", marginTop: 12,

  },

  photoModalImage: { width: "100%", height: "100%", borderRadius: 29, backgroundColor: "#EDE7FF" },

  photoModalFallback: {

    width: "100%", height: "100%", borderRadius: 29, backgroundColor: "#EDE7FF",

    alignItems: "center", justifyContent: "center",

  },

  photoModalInitials: { color: PURPLE, fontSize: 42, fontWeight: "900" },

  photoModalTitle: { color: NAVY, fontSize: 20, fontWeight: "900", marginTop: 18, textAlign: "center" },

  photoModalSubtitle: { color: MUTED, fontSize: 12, marginTop: 5 },

  changePhotoButton: {

    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9,

    width: "100%", backgroundColor: PURPLE, borderRadius: 15, paddingVertical: 15, marginTop: 22,

  },

  changePhotoButtonText: { color: WHITE, fontSize: 14, fontWeight: "900" },

  photoModalHint: { color: MUTED, fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 12 },

});


