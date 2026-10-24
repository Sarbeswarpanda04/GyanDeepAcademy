import React, { useCallback, useState } from "react";
import {
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, router } from "expo-router";

import { supabase } from "../lib/supabase";

const PURPLE_DARK = "#6D28D9";
const PURPLE = "#8B5CF6";
const PURPLE_LIGHT = "#C4B5FD";
const WHITE = "#FFFFFF";
const MUTED = "#F3EFFF";

type InstituteBrand = {
  name: string;
  logo_url: string | null;
};

type Props = {
  subtitle?: string;
  showSupport?: boolean;
  onSupportPress?: () => void;
};

export default function InstituteHeader({
  subtitle = "Institute account",
  showSupport = true,
  onSupportPress,
}: Props) {
  const [brand, setBrand] = useState<InstituteBrand>({
    name: "GyanDeep Academy",
    logo_url: null,
  });

  const loadBrand = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) return;

      const { data: membership, error: membershipError } =
        await supabase
          .from("institute_members")
          .select("institute_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

      if (membershipError) throw membershipError;
      if (!membership) return;

      const { data, error } = await supabase
        .from("institutes")
        .select("name, logo_url")
        .eq("id", membership.institute_id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return;

      let logoUrl: string | null = data.logo_url ?? null;

      // Support both public URLs and private Storage object paths.
      if (logoUrl && !/^https?:\/\//i.test(logoUrl)) {
        const { data: signedData, error: signedError } =
          await supabase.storage
            .from("institute-assets")
            .createSignedUrl(logoUrl, 3600);

        logoUrl =
          signedError || !signedData
            ? null
            : signedData.signedUrl;
      }

      setBrand({
        name: data.name?.trim() || "GyanDeep Academy",
        logo_url: logoUrl,
      });
    } catch (error) {
      console.warn("Unable to load institute branding:", error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadBrand();
    }, [loadBrand])
  );

  const handleSupportPress = () => {
    if (onSupportPress) {
      onSupportPress();
    } else {
      router.push("/settings" as never);
    }
  };

  return (
    <LinearGradient
      colors={["#611cd0", "#44109d", "#4c02f7"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.wrapper}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor={PURPLE_DARK}
        translucent={false}
      />

      <View style={styles.container}>
        {/* Institute logo */}
        <View style={styles.logoOuter}>
          <View style={styles.logoFrame}>
            {brand.logo_url ? (
              <Image
                key={brand.logo_url}
                source={{ uri: brand.logo_url }}
                style={styles.logo}
                resizeMode="contain"
              />
            ) : (
              <LinearGradient
                colors={["#FFFFFF", "#F3EFFF"]}
                style={styles.fallbackLogo}
              >
                <Text style={styles.fallbackText}>GD</Text>
                <View style={styles.logoAccent} />
                <Text style={styles.logoCaption}>ACADEMY</Text>
              </LinearGradient>
            )}
          </View>
        </View>

        {/* Institute details */}
        <View style={styles.textContainer}>
          <Text
            style={styles.eyebrow}
            numberOfLines={1}
          >
            INSTITUTE PORTAL
          </Text>

          <Text
            style={styles.instituteName}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {brand.name}
          </Text>

          <View style={styles.subtitleRow}>
            <View style={styles.statusDot} />
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </View>

        {/* Support action */}
        {showSupport && (
          <TouchableOpacity
            style={styles.supportButton}
            accessibilityRole="button"
            accessibilityLabel="Help and support"
            activeOpacity={0.75}
            onPress={handleSupportPress}
          >
            <Feather
              name="help-circle"
              size={23}
              color={WHITE}
            />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.bottomHighlight} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: "hidden",
  },

  container: {
    width: "100%",
    minHeight: 112,
    paddingHorizontal: 18,
    paddingTop: 36,
    paddingBottom: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },

  logoOuter: {
    width: 60,
    height: 60,
    borderRadius: 19,
    padding: 2,
    backgroundColor: "rgba(255,255,255,0.48)",
    flexShrink: 0,
  },

  logoFrame: {
    flex: 1,
    borderRadius: 17,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  logo: {
    width: "100%",
    height: "100%",
  },

  fallbackLogo: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },

  fallbackText: {
    color: PURPLE_DARK,
    fontSize: 24,
    lineHeight: 27,
    fontWeight: "900",
    letterSpacing: -1.2,
  },

  logoAccent: {
    width: 25,
    height: 3,
    borderRadius: 2,
    backgroundColor: PURPLE,
    marginTop: 1,
  },

  logoCaption: {
    color: PURPLE_DARK,
    fontSize: 6,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginTop: 3,
  },

  textContainer: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },

  eyebrow: {
    color: PURPLE_LIGHT,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.7,
    marginBottom: 3,
  },

  instituteName: {
    color: WHITE,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
    letterSpacing: 0.1,
  },

  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
    gap: 7,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#D9F99D",
  },

  subtitle: {
    flex: 1,
    color: MUTED,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.2,
  },

  supportButton: {
    width: 43,
    height: 43,
    flexShrink: 0,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },

  bottomHighlight: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.24)",
  },
});