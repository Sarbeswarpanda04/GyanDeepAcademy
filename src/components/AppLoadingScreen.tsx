import React from "react";
import {
  ActivityIndicator,
  ImageBackground,
  StyleSheet,
  Text,
  View,
  StatusBar,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AppLoadingScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <StatusBar
        hidden
        backgroundColor="#F4F9FF"
        barStyle="dark-content"
      />

      <ImageBackground
        source={require("../../assets/images/splash.png")}
        style={styles.container}
        resizeMode="cover"
        accessibilityLabel="GyanDeep Academy splash screen"
      >
        <View
          style={[
            styles.loading,
            {
              top: height * 0.72,
              paddingBottom: insets.bottom,
              width: width,
            },
          ]}
        >
          <ActivityIndicator
            size="large"
            color="#2585F5"
          />

          <Text style={styles.loadingText}>
            Loading...
          </Text>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F4F9FF",
  },

  container: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#F4F9FF",
  },

  loading: {
    position: "absolute",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  loadingText: {
    fontSize: 16,
    color: "#526782",
    fontWeight: "500",
    letterSpacing: 0.3,
  },
});