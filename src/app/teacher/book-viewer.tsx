import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { WebView } from "react-native-webview";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../../lib/supabase";

type Book = {
  id: string;
  name: string;
  pdf_path: string;
  is_active: boolean;
};

const BUCKET = "institute-books";
const PURPLE = "#611CD0";
const PURPLE_DARK = "#44109D";
const PURPLE_BRIGHT = "#4C02F7";
const BG = "#F3F3FF";
const INK = "#241344";
const MUTED = "#718096";
const BORDER = "#E8E3F5";
const LAVENDER = "#EDE7FF";
const WHITE = "#FFFFFF";

export default function TeacherBookViewer() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookId?: string | string[] }>();
  const bookId = Array.isArray(params.bookId)
    ? params.bookId[0]
    : params.bookId;

  const [book, setBook] = useState<Book | null>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [webLoading, setWebLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  const loadBook = useCallback(async () => {
    if (!bookId) {
      setError("Book ID is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    setPdfUrl("");

    try {
      const { data, error: dbError } = await supabase
        .from("institute_books")
        .select("id,name,pdf_path,is_active")
        .eq("id", bookId)
        .eq("is_active", true)
        .single();

      if (dbError) throw dbError;
      if (!data?.pdf_path) throw new Error("PDF file not found.");

      const { data: signed, error: storageError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(data.pdf_path, 3600);

      if (storageError) throw storageError;

      setBook(data as Book);
      setPdfUrl(signed.signedUrl);
      setWebLoading(true);
    } catch (err) {
      console.error("Book loading error:", err);
      setError(
        err instanceof Error ? err.message : "Unable to load this book.",
      );
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    void loadBook();
  }, [loadBook]);

  const downloadBook = async () => {
    if (!book || !pdfUrl) return;

    setDownloading(true);

    try {
      const directory = FileSystem.cacheDirectory;
      if (!directory) throw new Error("File storage is unavailable.");

      const safeName =
        book.name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_") || "book";
      const destination = `${directory}${safeName}.pdf`;
      const result = await FileSystem.downloadAsync(pdfUrl, destination);

      if (result.status < 200 || result.status >= 300) {
        throw new Error("Could not download the PDF.");
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          mimeType: "application/pdf",
          dialogTitle: `Share ${book.name}`,
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("Downloaded", "The PDF was downloaded to app cache.");
      }
    } catch (err) {
      Alert.alert(
        "Download failed",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <Stack.Screen
        options={{
          title: book?.name ?? "PDF Reader",
          headerShown: false,
        }}
      />

      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Feather name="arrow-left" size={20} color={INK} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>TEACHER LIBRARY</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {book?.name ?? "PDF Reader"}
          </Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Download or share PDF"
          onPress={downloadBook}
          disabled={!pdfUrl || downloading}
          activeOpacity={0.85}
          style={[
            styles.downloadButton,
            (!pdfUrl || downloading) && styles.downloadButtonDisabled,
          ]}
        >
          {downloading ? (
            <ActivityIndicator size="small" color={WHITE} />
          ) : (
            <Feather name="download" size={16} color={WHITE} />
          )}
          <Text style={styles.downloadText}>
            {downloading ? "Saving" : "Save"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.readerHeading}>
        <LinearGradient
          colors={[PURPLE, PURPLE_DARK, PURPLE_BRIGHT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.readerIcon}
        >
          <Feather name="book-open" size={22} color={WHITE} />
        </LinearGradient>
        <View style={styles.readerCopy}>
          <Text style={styles.readerTitle}>Book reader</Text>
          <Text style={styles.readerSubtitle}>
            Read your study material or save a copy
          </Text>
        </View>
        <View style={styles.pdfPill}>
          <Feather name="file-text" size={12} color={PURPLE} />
          <Text style={styles.pdfPillText}>PDF</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <View style={styles.stateIcon}>
            <ActivityIndicator size="large" color={PURPLE} />
          </View>
          <Text style={styles.stateTitle}>Loading your book</Text>
          <Text style={styles.message}>Preparing the PDF for reading…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <View style={styles.stateIcon}>
            <Feather name="alert-circle" size={25} color="#D9535D" />
          </View>
          <Text style={styles.stateTitle}>Couldn’t open this book</Text>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.retry}
            onPress={() => void loadBook()}
            activeOpacity={0.85}
          >
            <Feather name="refresh-cw" size={15} color={WHITE} />
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : pdfUrl ? (
        <View style={styles.viewerCard}>
          <View style={styles.viewerTopbar}>
            <View style={styles.viewerDot} />
            <Text style={styles.viewerLabel}>DOCUMENT PREVIEW</Text>
            <View style={styles.viewerSecure}>
              <Feather name="shield" size={12} color="#15966A" />
              <Text style={styles.viewerSecureText}>Secure link</Text>
            </View>
          </View>

          <View style={styles.viewer}>
            {webLoading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={PURPLE} />
                <Text style={styles.stateTitle}>Opening PDF</Text>
                <Text style={styles.message}>This may take a moment…</Text>
              </View>
            )}

            <WebView
              key={pdfUrl}
              source={{
                uri: `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(pdfUrl)}`,
              }}
              style={styles.webview}
              originWhitelist={["*"]}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              onLoadEnd={() => setWebLoading(false)}
              onError={() => setWebLoading(false)}
            />
          </View>

          {!webLoading && (
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.openButton}
              onPress={() => void Linking.openURL(pdfUrl)}
              activeOpacity={0.8}
            >
              <Feather name="external-link" size={16} color={PURPLE} />
              <Text style={styles.openButtonText}>Open PDF directly</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      <View style={styles.footer}>
        <Feather name="book-open" size={13} color={MUTED} />
        <Text style={styles.footerText}>
          GyanDeep Academy · Teacher Library
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 35,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: BG,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: PURPLE,
    fontSize: 9,
    letterSpacing: 1.35,
    fontWeight: "800",
  },
  headerTitle: {
    color: INK,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 3,
  },
  downloadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 42,
    paddingHorizontal: 13,
    borderRadius: 14,
    backgroundColor: PURPLE,
  },
  downloadButtonDisabled: {
    opacity: 0.55,
  },
  downloadText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: "800",
  },
  readerHeading: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 14,
    padding: 14,
    borderRadius: 20,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  readerIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  readerCopy: {
    flex: 1,
    minWidth: 0,
  },
  readerTitle: {
    color: INK,
    fontSize: 15,
    fontWeight: "800",
  },
  readerSubtitle: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  pdfPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: LAVENDER,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
  },
  pdfPillText: {
    color: PURPLE,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  viewerCard: {
    flex: 1,
    marginHorizontal: 12,
    marginBottom: 8,
    overflow: "hidden",
    borderRadius: 20,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: "#321064",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  viewerTopbar: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: WHITE,
  },
  viewerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: PURPLE,
  },
  viewerLabel: {
    flex: 1,
    color: MUTED,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  viewerSecure: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E4F7EF",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
  },
  viewerSecureText: {
    color: "#15966A",
    fontSize: 9,
    fontWeight: "800",
  },
  viewer: {
    flex: 1,
    backgroundColor: BG,
  },
  webview: {
    flex: 1,
    backgroundColor: BG,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 30,
  },
  stateIcon: {
    width: 62,
    height: 62,
    borderRadius: 21,
    backgroundColor: LAVENDER,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  stateTitle: {
    color: INK,
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 12,
  },
  message: {
    color: MUTED,
    marginTop: 7,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  error: {
    color: "#B42332",
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  retry: {
    marginTop: 18,
    backgroundColor: PURPLE,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  retryText: {
    color: WHITE,
    fontWeight: "800",
    fontSize: 12,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  openButton: {
    minHeight: 48,
    paddingHorizontal: 14,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: WHITE,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  openButtonText: {
    color: PURPLE,
    fontWeight: "800",
    fontSize: 12,
  },
  footer: {
    minHeight: 28,
    paddingHorizontal: 16,
    paddingBottom: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  footerText: {
    color: MUTED,
    fontSize: 10,
    fontWeight: "600",
  },
});
