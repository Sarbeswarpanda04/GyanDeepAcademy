
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";

export default function FeesScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.icon}>
        <Feather name="credit-card" size={32} color="#7952BB" />
      </View>
      <Text style={styles.title}>Fee Management</Text>
      <Text style={styles.subtitle}>
        Manage fee collection and pending payments.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F5F8",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  icon: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: "#F1EAFE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: {
    fontSize: 25,
    fontWeight: "800",
    color: "#202F42",
  },
  subtitle: {
    fontSize: 14,
    color: "#718397",
    marginTop: 8,
    textAlign: "center",
  },
});
