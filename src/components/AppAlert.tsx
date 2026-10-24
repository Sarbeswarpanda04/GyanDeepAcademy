import React, { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
export type AppAlertType = "success" | "error" | "info" | "warning";
type Props = {
  visible: boolean;
  title: string;
  message: string;
  type?: AppAlertType;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
};
const themes = {
  success: {
    icon: "check-circle" as const,
    color: "#16845B",
    bg: "#DDF7EB",
    button: ["#DDF7EB", "#C7F0DD"] as [string, string],
  },
  error: {
    icon: "x-circle" as const,
    color: "#CC4255",
    bg: "#FFE8EC",
    button: ["#FFE8EC", "#FFD9E0"] as [string, string],
  },
  info: {
    icon: "info" as const,
    color: "#3478B9",
    bg: "#DFEEFF",
    button: ["#DCEEFF", "#C7E2FF"] as [string, string],
  },
  warning: {
    icon: "alert-triangle" as const,
    color: "#A96C13",
    bg: "#FFF0D9",
    button: ["#FFF0D9", "#FFE5BB"] as [string, string],
  },
};
export default function AppAlert({
  visible,
  title,
  message,
  type = "info",
  confirmLabel = "OK",
  cancelLabel,
  onConfirm,
  onCancel,
}: Props) {
  const opacity = useRef(new Animated.Value(0)).current,
    scale = useRef(new Animated.Value(0.88)).current,
    translateY = useRef(new Animated.Value(18)).current,
    closing = useRef(false);
  useEffect(() => {
    if (!visible) {
      closing.current = false;
      opacity.setValue(0);
      scale.setValue(0.88);
      translateY.setValue(18);
      return;
    }
    closing.current = false;
    const a = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        speed: 20,
        bounciness: 5,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 230,
        useNativeDriver: true,
      }),
    ]);
    a.start();
    return () => a.stop();
  }, [visible, opacity, scale, translateY]);
  const theme = themes[type];
  const dismiss = (confirmed: boolean) => {
    if (closing.current) return;
    closing.current = true;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.92,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 12,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        onCancel?.();
        if (confirmed) onConfirm?.();
      }
      closing.current = false;
    });
  };
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => dismiss(false)}
    >
      <View style={s.overlay}>
        <Animated.View style={[s.backdrop, { opacity }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => dismiss(false)}
          />
        </Animated.View>
        <Animated.View
          accessibilityRole="alert"
          style={[s.card, { opacity, transform: [{ scale }, { translateY }] }]}
        >
          <LinearGradient colors={["#FFFFFF", "#F3F8FF"]} style={s.gradient}>
            <View style={[s.iconCircle, { backgroundColor: theme.bg }]}>
              <Feather name={theme.icon} size={29} color={theme.color} />
            </View>
            <Text style={s.title}>{title}</Text>
            <Text style={s.message}>{message}</Text>
            <View style={s.actions}>
              {cancelLabel ? (
                <Pressable onPress={() => dismiss(false)} style={s.cancel}>
                  <Text style={s.cancelText}>{cancelLabel}</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => dismiss(true)} style={s.confirmWrap}>
                <LinearGradient colors={theme.button} style={s.confirm}>
                  <Text style={[s.confirmText, { color: theme.color }]}>
                    {confirmLabel}
                  </Text>
                  <Feather name="arrow-right" size={16} color={theme.color} />
                </LinearGradient>
              </Pressable>
            </View>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}
const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 25,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(22,48,79,.38)",
  },
  card: {
    width: "100%",
    maxWidth: 370,
    borderRadius: 26,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DCEBFA",
    elevation: 18,
    shadowColor: "#173B65",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
  },
  gradient: {
    alignItems: "center",
    paddingHorizontal: 23,
    paddingTop: 27,
    paddingBottom: 22,
  },
  iconCircle: {
    width: 67,
    height: 67,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 17,
  },
  title: {
    fontSize: 21,
    fontWeight: "800",
    color: "#173B65",
    textAlign: "center",
  },
  message: {
    color: "#71859D",
    fontSize: 13,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 10,
  },
  actions: { flexDirection: "row", width: "100%", gap: 10, marginTop: 25 },
  cancel: {
    flex: 1,
    minHeight: 47,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DCE8F5",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  cancelText: { color: "#58718D", fontSize: 13, fontWeight: "700" },
  confirmWrap: { flex: 1, borderRadius: 14, overflow: "hidden" },
  confirm: {
    minHeight: 47,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  confirmText: { fontSize: 13, fontWeight: "800" },
});
