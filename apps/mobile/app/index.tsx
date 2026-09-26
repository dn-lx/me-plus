import { ME_PLUS_DOMAINS } from "@me-plus/domain";
import { radius, spacing, typography } from "@me-plus/ui";
import { ScrollView, StyleSheet, Text, View } from "react-native";

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
        Mobile is the quick-capture and device-facing client. Shared business rules stay outside native code.
      </Text>

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
