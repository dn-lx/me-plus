import { radius, spacing, typography } from "@me-plus/ui";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  inventoryHealthConnect,
  requestHealthConnectReadPermissions,
  type HealthConnectInventory,
} from "../lib/health/health-connect";

export default function HealthConnectScreen() {
  const [inventory, setInventory] = useState<HealthConnectInventory | null>(null);
  const [status, setStatus] = useState("Ready to inspect Health Connect.");
  const [busy, setBusy] = useState(false);

  async function requestPermissions() {
    setBusy(true);
    setStatus("Requesting read access…");
    try {
      const permissions = await requestHealthConnectReadPermissions();
      setStatus(`Health Connect granted ${permissions.length} read permission entries.`);
    } catch (error) {
      setStatus(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function scan() {
    setBusy(true);
    setStatus("Scanning the last 7 days of Health Connect records…");
    try {
      const nextInventory = await inventoryHealthConnect(7);
      setInventory(nextInventory);
      const populated = nextInventory.items.filter((item) => item.count > 0).length;
      setStatus(`Inventory complete: ${populated} record types contain data in the last 7 days.`);
    } catch (error) {
      setStatus(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>HEALTH CONNECT · LIVE INVENTORY</Text>
      <Text style={styles.title}>See exactly what your watch is making available to Me+.</Text>
      <Text style={styles.lede}>
        This screen reads Health Connect only. It does not upload records yet. The first goal is to identify the real record types and preserve their source origins before we finalize ingestion mappings.
      </Text>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>STATUS</Text>
        <Text style={styles.statusText}>{status}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={requestPermissions}
        style={[styles.button, busy && styles.buttonDisabled]}
      >
        <Text style={styles.buttonText}>1. Grant Me+ read access</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={scan}
        style={[styles.button, styles.secondaryButton, busy && styles.buttonDisabled]}
      >
        <Text style={styles.buttonText}>2. Scan last 7 days</Text>
      </Pressable>

      {inventory ? (
        <>
          <Text style={styles.sectionTitle}>Inventory</Text>
          <Text style={styles.inventoryMeta}>
            Granted permissions: {inventory.permissionCount} · Window: {formatDate(inventory.windowStart)} → {formatDate(inventory.windowEnd)}
          </Text>
          <View style={styles.list}>
            {inventory.items.map((item) => (
              <View key={item.recordType} style={styles.recordCard}>
                <View style={styles.recordHeader}>
                  <Text style={styles.recordType}>{item.recordType}</Text>
                  <Text style={styles.recordCount}>{item.count}</Text>
                </View>
                <Text style={styles.recordMeta}>
                  Sources: {item.dataOrigins.length ? item.dataOrigins.join(", ") : "none found"}
                </Text>
                <Text style={styles.recordMeta}>
                  Latest: {item.latestObservedAt ? formatDateTime(item.latestObservedAt) : "—"}
                </Text>
                {item.error ? <Text style={styles.errorText}>{item.error}</Text> : null}
              </View>
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.noteCard}>
        <Text style={styles.noteTitle}>Next implementation step</Text>
        <Text style={styles.noteBody}>
          Once this inventory confirms the real Zepp/Health Connect record set, Me+ can map those records into raw_events plus normalized health tables while retaining timestamps, source app and device provenance.
        </Text>
      </View>
    </ScrollView>
  );
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown Health Connect error";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
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
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: "#344456",
    borderRadius: radius.lg,
    backgroundColor: "#141c27",
  },
  statusLabel: {
    marginBottom: spacing.sm,
    color: "#8fc8fa",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.3,
  },
  statusText: {
    color: "#e9eef5",
    fontSize: typography.label,
    lineHeight: 21,
  },
  button: {
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 15,
    borderRadius: radius.md,
    backgroundColor: "#1d5f8c",
  },
  secondaryButton: {
    marginBottom: spacing.xl,
    backgroundColor: "#27384b",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#f5f7fa",
    fontSize: typography.label,
    fontWeight: "700",
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    color: "#f5f7fa",
    fontSize: 20,
    fontWeight: "700",
  },
  inventoryMeta: {
    marginBottom: spacing.md,
    color: "#93a2b3",
    fontSize: 12,
    lineHeight: 18,
  },
  list: {
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  recordCard: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#273343",
    borderRadius: radius.md,
    backgroundColor: "#141c27",
  },
  recordHeader: {
    marginBottom: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  recordType: {
    color: "#e9eef5",
    fontSize: typography.label,
    fontWeight: "700",
  },
  recordCount: {
    color: "#9fd0ff",
    fontSize: 18,
    fontWeight: "800",
  },
  recordMeta: {
    color: "#99a7b6",
    fontSize: 12,
    lineHeight: 19,
  },
  errorText: {
    marginTop: spacing.sm,
    color: "#ffb4aa",
    fontSize: 12,
    lineHeight: 18,
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
