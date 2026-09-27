import { radius, spacing, typography } from "@me-plus/ui";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  runFakeSensorDiagnostics,
  type DiagnosticScenario,
} from "../lib/health/fake-health-connect";

const scenarios: readonly DiagnosticScenario[] = ["exact", "missing", "mismatch", "duplicate"];

const scenarioLabels: Record<DiagnosticScenario, string> = {
  exact: "Exact match",
  missing: "Missing record",
  mismatch: "Changed value",
  duplicate: "Duplicate record",
};

export default function SensorDiagnosticsScreen() {
  const [scenario, setScenario] = useState<DiagnosticScenario>("exact");
  const snapshot = useMemo(() => runFakeSensorDiagnostics(scenario), [scenario]);
  const result = snapshot.reconciliation;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>SENSOR DIAGNOSTICS · FIXTURE MODE</Text>
      <Text style={styles.title}>Prove the pipeline before trusting the dashboard.</Text>
      <Text style={styles.lede}>
        These are deterministic fake Health Connect-style records. No real health data is read or stored on this screen.
      </Text>

      <View style={[styles.statusCard, result.isExactMatch ? styles.passCard : styles.failCard]}>
        <Text style={styles.statusLabel}>{result.isExactMatch ? "PASS" : "FAIL DETECTED"}</Text>
        <Text style={styles.statusText}>
          {result.isExactMatch
            ? "The source fixture and simulated stored copy match exactly."
            : "The reconciliation logic detected an ingestion problem in this fixture."}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Test scenario</Text>
      <View style={styles.scenarioGrid}>
        {scenarios.map((item) => {
          const selected = item === scenario;
          return (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setScenario(item)}
              style={[styles.scenarioButton, selected && styles.scenarioButtonSelected]}
            >
              <Text style={[styles.scenarioText, selected && styles.scenarioTextSelected]}>
                {scenarioLabels[item]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>Reconciliation</Text>
      <View style={styles.metricsGrid}>
        <Metric label="Source" value={result.sourceCount} />
        <Metric label="Stored" value={result.storedCount} />
        <Metric label="Matched" value={result.matchedCount} />
        <Metric label="Missing" value={result.missingCount} />
        <Metric label="Mismatched" value={result.mismatchedCount} />
        <Metric label="Duplicates" value={result.duplicateCount} />
      </View>

      <Text style={styles.sectionTitle}>Source readings</Text>
      <View style={styles.readings}>
        {snapshot.readings.map((reading) => (
          <View key={reading.externalId} style={styles.readingCard}>
            <View style={styles.readingHeader}>
              <Text style={styles.readingMetric}>{reading.metric}</Text>
              <Text style={styles.readingValue}>
                {reading.value} {reading.unit}
              </Text>
            </View>
            <Text style={styles.readingMeta}>ID: {reading.externalId}</Text>
            <Text style={styles.readingMeta}>Source: {reading.provenance.sourcePackage}</Text>
            <Text style={styles.readingMeta}>Device: {reading.provenance.device ?? "unknown"}</Text>
            <Text style={styles.readingMeta}>Observed: {reading.observedAt}</Text>
          </View>
        ))}
      </View>

      <View style={styles.noteCard}>
        <Text style={styles.noteTitle}>Why the failing fixtures matter</Text>
        <Text style={styles.noteBody}>
          A useful diagnostic must fail when the pipeline is wrong. The missing, changed-value and duplicate fixtures deliberately corrupt the simulated stored data so we can verify that Me+ catches each class of ingestion error.
        </Text>
      </View>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: 64,
    paddingBottom: 48,
    backgroundColor: "#0b0f14",
  },
  eyebrow: {
    marginBottom: spacing.md,
    color: "#9db7d5",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  title: {
    marginBottom: spacing.md,
    color: "#f5f7fa",
    fontSize: typography.title,
    fontWeight: "700",
    lineHeight: 36,
  },
  lede: {
    marginBottom: spacing.lg,
    color: "#b8c2cf",
    fontSize: typography.body,
    lineHeight: 24,
  },
  statusCard: {
    marginBottom: spacing.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  passCard: {
    borderColor: "#2d8058",
    backgroundColor: "#10281d",
  },
  failCard: {
    borderColor: "#9b554d",
    backgroundColor: "#301816",
  },
  statusLabel: {
    marginBottom: spacing.sm,
    color: "#f5f7fa",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  statusText: {
    color: "#d4dce5",
    fontSize: typography.body,
    lineHeight: 24,
  },
  sectionTitle: {
    marginBottom: spacing.md,
    color: "#f5f7fa",
    fontSize: 20,
    fontWeight: "700",
  },
  scenarioGrid: {
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  scenarioButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#344456",
    borderRadius: radius.md,
    backgroundColor: "#141c27",
  },
  scenarioButtonSelected: {
    borderColor: "#80b8ef",
    backgroundColor: "#1b3148",
  },
  scenarioText: {
    color: "#b8c2cf",
    fontSize: typography.label,
    fontWeight: "600",
  },
  scenarioTextSelected: {
    color: "#eef7ff",
  },
  metricsGrid: {
    marginBottom: spacing.xl,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  metricCard: {
    width: "31%",
    minWidth: 96,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#273343",
    borderRadius: radius.md,
    backgroundColor: "#141c27",
  },
  metricValue: {
    color: "#f5f7fa",
    fontSize: 24,
    fontWeight: "700",
  },
  metricLabel: {
    marginTop: 4,
    color: "#93a2b3",
    fontSize: 12,
  },
  readings: {
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  readingCard: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#273343",
    borderRadius: radius.md,
    backgroundColor: "#141c27",
  },
  readingHeader: {
    marginBottom: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  readingMetric: {
    color: "#e9eef5",
    fontSize: typography.label,
    fontWeight: "700",
  },
  readingValue: {
    color: "#9fd0ff",
    fontSize: typography.label,
    fontWeight: "700",
  },
  readingMeta: {
    color: "#99a7b6",
    fontSize: 12,
    lineHeight: 19,
  },
  noteCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: "#141c27",
  },
  noteTitle: {
    marginBottom: spacing.sm,
    color: "#f5f7fa",
    fontSize: typography.body,
    fontWeight: "700",
  },
  noteBody: {
    color: "#b8c2cf",
    fontSize: typography.label,
    lineHeight: 21,
  },
});
