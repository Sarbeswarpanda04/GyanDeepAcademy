import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
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
      <Stack.Screen
        options={{
          title: book?.name ?? "PDF Reader",
          headerShown: true,
        }}
      />

      <View style={styles.toolbar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>

        <Text style={styles.title} numberOfLines={1}>
          {book?.name ?? "Book"}
        </Text>

        <TouchableOpacity
          onPress={downloadBook}
          disabled={!pdfUrl || downloading}
          style={styles.downloadButton}
        >
          <Text style={styles.downloadText}>
            {downloading ? "..." : "Download"}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.message}>Loading book...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity
            style={styles.retry}
            onPress={() => void loadBook()}
          >
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : pdfUrl ? (
        <View style={styles.viewer}>
          {webLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#2563EB" />
              <Text style={styles.message}>Opening PDF...</Text>
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

          {!webLoading && (
            <TouchableOpacity
              style={styles.openButton}
              onPress={() => void Linking.openURL(pdfUrl)}
            >
              <Text style={styles.openButtonText}>Open PDF directly</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F4F7FB",
  },
  toolbar: {
    minHeight: 56,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  back: {
    color: "#2563EB",
    fontSize: 14,
    fontWeight: "700",
  },
  title: {
    flex: 1,
    color: "#1D2D44",
    fontSize: 14,
    fontWeight: "700",
  },
  downloadButton: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
  },
  downloadText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  viewer: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: "#F4F7FB",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  message: {
    color: "#64748B",
    marginTop: 10,
    fontSize: 14,
  },
  error: {
    color: "#B91C1C",
    textAlign: "center",
    fontSize: 15,
  },
  retry: {
    marginTop: 16,
    backgroundColor: "#2563EB",
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 8,
  },
  retryText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
    backgroundColor: "#F4F7FB",
    alignItems: "center",
    justifyContent: "center",
  },
  openButton: {
    padding: 14,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  openButtonText: {
    color: "#2563EB",
    fontWeight: "700",
  },
});
