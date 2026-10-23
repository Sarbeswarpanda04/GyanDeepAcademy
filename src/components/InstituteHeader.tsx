
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
import { useFocusEffect, router } from "expo-router";
import { supabase } from "../lib/supabase";

const NAVY = "#202F42";
const NAVY_LIGHT = "#35485F";
const GOLD = "#E9BD59";
const MUTED = "#C0CCD8";
const WHITE = "#FFFFFF";

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

      // Resolve private Storage paths into signed URLs.
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
    <View style={styles.wrapper}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={NAVY}
        translucent={false}
      />

      <View style={styles.container}>
        {/* Institute logo */}
        <View style={styles.logoFrame}>
          {brand.logo_url ? (
            <Image
              key={brand.logo_url}
              source={{ uri: brand.logo_url }}
              style={styles.logo}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.fallbackLogo}>
              <Text style={styles.fallbackText}>GD</Text>
              <View style={styles.logoAccent} />
              <Text style={styles.logoCaption}>ACADEMY</Text>
            </View>
          )}
        </View>

        {/* Institute name and subtitle */}
        <View style={styles.textContainer}>
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

        {/* Support button */}
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: NAVY,
  },

  container: {
    width: "100%",
    minHeight: 100,
    backgroundColor: NAVY,
    paddingHorizontal: 18,
    paddingTop: 35,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  logoFrame: {
    width: 54,
    height: 54,
    flexShrink: 0,
    borderRadius: 15,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: "#E5D8B7",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  logo: {
    width: "100%",
    height: "100%",
  },

  fallbackLogo: {
    alignItems: "center",
    justifyContent: "center",
  },

  fallbackText: {
    color: NAVY,
    fontSize: 23,
    lineHeight: 26,
    fontWeight: "900",
    letterSpacing: -1,
  },

  logoAccent: {
    width: 24,
    height: 2,
    backgroundColor: GOLD,
    borderRadius: 2,
    marginTop: 1,
  },

  logoCaption: {
    color: "#947326",
    fontSize: 6,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginTop: 2,
  },

  textContainer: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },

  instituteName: {
    color: WHITE,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    letterSpacing: 0.1,
  },

  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
    gap: 6,
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GOLD,
  },

  subtitle: {
    flex: 1,
    color: MUTED,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.2,
  },

  supportButton: {
    width: 42,
    height: 42,
    flexShrink: 0,
    borderRadius: 14,
    backgroundColor: NAVY_LIGHT,
    borderWidth: 1,
    borderColor: "#46576B",
    alignItems: "center",
    justifyContent: "center",
  },
});
