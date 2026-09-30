import { ME_PLUS_DOMAINS } from "@me-plus/domain";
import { radius, spacing, typography } from "@me-plus/ui";
import { Link } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const domainDescriptions: Record<(typeof ME_PLUS_DOMAINS)[number], string> = {
  learning: "Practice, goals and progress",
  health: "Wearables, activity and recovery",
  finance: "Plans, context and decision support",
  time: "Tasks, routines and attention",
};

export default function HomeScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>ME+ DAILY SURFACE</Text>
      <Text style={styles.title}>One system for your daily context.</Text>
      <Text style={styles.lede}>
        Mobile is the quick-capture and device-facing client. Shared business rules remain outside native code.
      </Text>

      <Link href="/health-connect" asChild>
        <Pressable accessibilityRole="button" style={styles.healthCard}>
          <Text style={styles.healthEyebrow}>LIVE HEALTH CONNECT</Text>
          <Text style={styles.healthTitle}>Inventory watch data</Text>
          <Text style={styles.healthBody}>
            Grant read access and inspect exactly which Health Connect record types and source origins are available from your phone.
          </Text>
        </Pressable>
      </Link>

      <Link href="/sensor-diagnostics" asChild>
        <Pressable accessibilityRole="button" style={styles.diagnosticsCard}>
          <Text style={styles.diagnosticsEyebrow}>PIPELINE TEST HARNESS</Text>
          <Text style={styles.diagnosticsTitle}>Run fixture diagnostics</Text>
          <Text style={styles.diagnosticsBody}>
            Exercise exact, missing, changed-value and duplicate fixtures without touching real health data.
          </Text>
        </Pressable>
      </Link>

      <View style={styles.grid}>
        {ME_PLUS_DOMAINS.map((domain) => (
          <View key={domain} style={styles.card}>
            <Text style={styles.cardTitle}>{domain}</Text>
            <Text style={styles.cardBody}>{domainDescriptions[domain]}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: 72,
    paddingBottom: 48,
    backgroundColor: "#0b0f14",
  },
  eyebrow: {
    marginBottom: spacing.md,
    color: "#9db7d5",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.8,
  },
  title: {
    marginBottom: spacing.md,
    color: "#f5f7fa",
    fontSize: typography.display,
    fontWeight: "700",
    lineHeight: 44,
  },
  lede: {
    marginBottom: spacing.xl,
    color: "#b8c2cf",
    fontSize: typography.body,
    lineHeight: 25,
  },
  healthCard: {
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: "#2d8058",
    borderRadius: radius.lg,
    backgroundColor: "#10281d",
  },
  healthEyebrow: {
    marginBottom: spacing.sm,
    color: "#9de5bb",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  healthTitle: {
    marginBottom: spacing.sm,
    color: "#f5f7fa",
    fontSize: 22,
    fontWeight: "700",
  },
  healthBody: {
    color: "#c8ddd1",
    fontSize: typography.label,
    lineHeight: 21,
  },
  diagnosticsCard: {
    marginBottom: spacing.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: "#3d6f99",
    borderRadius: radius.lg,
    backgroundColor: "#11263a",
  },
  diagnosticsEyebrow: {
    marginBottom: spacing.sm,
    color: "#8fc8fa",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  diagnosticsTitle: {
    marginBottom: spacing.sm,
    color: "#f5f7fa",
    fontSize: 22,
    fontWeight: "700",
  },
  diagnosticsBody: {
    color: "#c2d2e2",
    fontSize: typography.label,
    lineHeight: 21,
  },
  grid: {
    gap: spacing.md,
  },
  card: {
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: "#273343",
    borderRadius: radius.lg,
    backgroundColor: "#141c27",
  },
  cardTitle: {
    marginBottom: spacing.sm,
    color: "#f5f7fa",
    fontSize: 20,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  cardBody: {
    color: "#c5ced9",
    fontSize: typography.body,
  },
});
