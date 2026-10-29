import { useCallback, useEffect, useRef, useState } from "react";
import { Stack, router, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { supabase } from "../lib/supabase";
import AppLoadingScreen from "../components/AppLoadingScreen";

// Keep the native splash visible until the root layout is ready.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const segments = useSegments();

  const [startupComplete, setStartupComplete] = useState(false);

  const segmentsRef = useRef<string[]>([...segments]);
  const mountedRef = useRef(false);
  const checkingRef = useRef(false);
  const redirectingRef = useRef(false);

  useEffect(() => {
    segmentsRef.current = [...segments];
  }, [segments]);

  const redirectActiveTeacher = useCallback(async () => {
    if (!mountedRef.current || checkingRef.current) {
      return;
    }

    checkingRef.current = true;

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.warn(
          "[auth-startup] Could not restore session:",
          sessionError.message,
        );
        return;
      }

      if (!session?.user || !mountedRef.current) {
        return;
      }

      const currentSegments = segmentsRef.current;
      const firstSegment = currentSegments[0];

      // Never redirect away from a teacher route.
      if (firstSegment === "teacher") {
        return;
      }

      // Only redirect from public entry routes.
      const isPublicEntry =
        currentSegments.length === 0 ||
        firstSegment === "index" ||
        firstSegment === "login" ||
        firstSegment === "signup";

      // Preserve owner, manager, and other authenticated routes.
      if (!isPublicEntry) {
        return;
      }

      const { data: membership, error: membershipError } = await supabase
        .from("institute_team_members")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("role", "teacher")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (membershipError) {
        console.warn(
          "[auth-startup] Teacher membership check failed:",
          membershipError.message,
        );
        return;
      }

      if (!membership || !mountedRef.current || redirectingRef.current) {
        return;
      }

      // Recheck the route before redirecting.
      const latestSegments = segmentsRef.current;
      const latestFirstSegment = latestSegments[0];

      const stillPublicEntry =
        latestSegments.length === 0 ||
        latestFirstSegment === "index" ||
        latestFirstSegment === "login" ||
        latestFirstSegment === "signup";

      if (!stillPublicEntry) {
        return;
      }

      redirectingRef.current = true;

      router.replace("/teacher/teacher-dashboard" as never);
    } catch (error) {
      console.warn("[auth-startup] Route check failed:", error);
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const initialize = async () => {
      try {
        await redirectActiveTeacher();
      } finally {
        if (mountedRef.current) {
          setStartupComplete(true);
        }
      }
    };

    void initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!mountedRef.current) {
        return;
      }

      if (event === "SIGNED_OUT") {
        redirectingRef.current = false;
        router.replace("/");
        return;
      }

      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        void redirectActiveTeacher();
      }
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [redirectActiveTeacher]);

  // Hide the native splash only after React has rendered the app UI.
  useEffect(() => {
    if (!startupComplete) {
      return;
    }

    const hideNativeSplash = async () => {
      await SplashScreen.hideAsync().catch(() => {});
    };

    void hideNativeSplash();
  }, [startupComplete]);

  if (!startupComplete) {
    return <AppLoadingScreen />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        animationDuration: 220,
        contentStyle: {
          backgroundColor: "#F7F8FE",
        },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="institute-setup" />
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="students" />
      <Stack.Screen name="add-students" />
      <Stack.Screen name="student-details-document" />
      <Stack.Screen name="student-id-card" />
      <Stack.Screen name="student-id-card-settings" />
      <Stack.Screen name="attendance" />
      <Stack.Screen name="fees" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="institute-profile" />
      <Stack.Screen name="classes" />
      <Stack.Screen name="batches" />
      <Stack.Screen name="teacher/teacher-login" />
      <Stack.Screen name="teacher/teacher-dashboard" />
      <Stack.Screen name="notices" />
      <Stack.Screen name="notice-compose" />
    </Stack>
  );
}
