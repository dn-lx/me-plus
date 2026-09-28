import { radius, spacing, typography } from "@me-plus/ui";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  requestHealthConnectReadPermissions,
  scanHealthConnect,
  type HealthConnectInventory,
} from "../lib/health/health-connect";
import {
  syncHealthConnectReadings,
  type HealthSyncSummary,
} from "../lib/health/sync-health-readings";
import { supabase } from "../lib/supabase/client";
import type { SensorReading } from "@me-plus/contracts";

export default function HealthConnectScreen() {
  const [inventory, setInventory] = useState<HealthConnectInventory | null>(null);
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [syncSummary, setSyncSummary] = useState<HealthSyncSummary | null>(null);
  const [status, setStatus] = useState("Ready to connect Health Connect to Me+.");
  const [busy, setBusy] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) {
        return;
      }

      if (error) {
        setStatus(`Unable to read Me+ session: ${error.message}`);
        return;
      }

      setAuthenticated(Boolean(data.session));
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setAuthenticated(Boolean(session));
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function signIn() {
    if (!email.trim() || !password) {
      setStatus("Enter your Me+ email and password first.");
      return;
    }

    setBusy(true);
    setStatus("Connecting this phone to Me+…");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        throw error;
      }

      setPassword("");
      setStatus("Phone connected to Me+. Your session is stored securely on this device.");
    } catch (error) {
      setStatus(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }

      setStatus("This phone is disconnected from Me+.");
    } catch (error) {
      setStatus(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function requestPermissions() {
    setBusy(true);
    setStatus("Requesting Health Connect read access…");
    try {
      const permissions = await requestHealthConnectReadPermissions();
      setStatus(`Health Connect granted ${permissions.length} read permission entries.`);
    } catch (error) {
      setStatus(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    if (!inventory?.records.length) {
      setStatus("Scan Health Connect before uploading.");
      return;
    }

    setBusy(true);
    setStatus(`Uploading ${inventory.records.length} Health Connect records to Me+…`);
    try {
      const result = await syncHealthConnectRecords(inventory.records, inventory.windowEnd);
      setStatus(
        `Me+ sync complete: ${result.recordsSeen} seen · ${result.recordsCreated} created · ${result.recordsUpdated} reconciled.`,
      );
    } catch (error) {
      setStatus(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function scan() {
    setBusy(true);
    setSyncSummary(null);
    setStatus("Scanning and paginating the last 7 days of Health Connect records…");
    try {
      const scanResult = await scanHealthConnect(7);
      setInventory(scanResult.inventory);
      setReadings(scanResult.readings);
      const populated = scanResult.inventory.items.filter((item) => item.count > 0).length;
      setStatus(
        `Scan complete: ${populated} record types contain data and ${scanResult.readings.length} normalized readings are ready to upload.`,
      );
    } catch (error) {
      setStatus(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    if (!authenticated) {
      setStatus("Connect this phone to your Me+ account before uploading.");
      return;
    }

    if (!inventory || readings.length === 0) {
      setStatus("Scan Health Connect before uploading.");
      return;
    }

    setBusy(true);
    setStatus(`Uploading ${readings.length} readings to Me+…`);
    try {
      const result = await syncHealthConnectReadings(readings, {
        windowStart: inventory.windowStart,
        windowEnd: inventory.windowEnd,
      });
      setSyncSummary(result);
      setStatus(
        `Me+ sync complete: ${result.recordsCreated} created, ${result.recordsUpdated} updated across ${result.sourceCount} source origins.`,
      );
    } catch (error) {
      setStatus(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>HEALTH CONNECT · ME+ SYNC</Text>
      <Text style={styles.title}>Bring your watch data into Me+ without losing where it came from.</Text>
      <Text style={styles.lede}>
        Me+ reads Health Connect on this phone, paginates the full seven-day window, preserves source-app and device provenance, and uploads authenticated batches into Me+.
      </Text>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>STATUS</Text>
        <Text style={styles.statusText}>{status}</Text>
      </View>

      <View style={styles.authCard}>
        <View style={styles.authHeader}>
          <Text style={styles.authTitle}>Me+ connection</Text>
          <Text style={[styles.authBadge, authenticated ? styles.authBadgeOn : styles.authBadgeOff]}>
            {authenticated ? "CONNECTED" : "NOT CONNECTED"}
          </Text>
        </View>

        {authenticated ? (
          <>
            <Text style={styles.authBody}>
              This phone has a persistent Supabase session and can upload health records to your Me+ account.
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={signOut}
              style={[styles.compactButton, busy && styles.buttonDisabled]}
            >
              <Text style={styles.compactButtonText}>Disconnect phone</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.authBody}>
              Sign in once with your existing Me+ account. The session persists locally on this phone.
            </Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              editable={!busy}
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Me+ email"
              placeholderTextColor="#68798b"
              style={styles.input}
              value={email}
            />
            <TextInput
              autoCapitalize="none"
              autoComplete="password"
              editable={!busy}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="#68798b"
              secureTextEntry
              style={styles.input}
              value={password}
            />
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={signIn}
              style={[styles.compactButton, styles.connectButton, busy && styles.buttonDisabled]}
            >
              <Text style={styles.compactButtonText}>Connect phone to Me+</Text>
            </Pressable>
          </>
        )}
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
        <Text style={styles.buttonText}>2. Scan full last 7 days</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        disabled={busy || !authenticated || readings.length === 0}
        onPress={upload}
        style={[
          styles.button,
          styles.uploadButton,
          (busy || !authenticated || readings.length === 0) && styles.buttonDisabled,
        ]}
      >
        <Text style={styles.buttonText}>
          3. Upload {readings.length > 0 ? `${readings.length} readings` : "to Me+"}
        </Text>
      </Pressable>

      {syncSummary ? (
        <View style={styles.successCard}>
          <Text style={styles.successTitle}>SYNCED TO ME+</Text>
          <Text style={styles.successText}>
            {syncSummary.recordsSeen} readings processed · {syncSummary.recordsCreated} created · {syncSummary.recordsUpdated} updated · {syncSummary.sourceCount} source origins · {syncSummary.batchCount} upload batches
          </Text>
        </View>
      ) : null}

      {inventory ? (
        <>
          <Text style={styles.sectionTitle}>Inventory</Text>
          <Text style={styles.inventoryMeta}>
            Granted permissions: {inventory.permissionCount} · Window: {formatDate(inventory.windowStart)} → {formatDate(inventory.windowEnd)} · Normalized readings: {readings.length}
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
        <Text style={styles.noteTitle}>What Me+ stores</Text>
        <Text style={styles.noteBody}>
          Each uploaded reading is kept idempotently as a raw event and normalized observation. Source package, device metadata, original Health Connect payload, timestamps and sync-run provenance are retained so Zepp/Huami, RENPHO and future devices are not merged blindly.
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
  authCard: {
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: "#273343",
    borderRadius: radius.lg,
    backgroundColor: "#101821",
  },
  authHeader: {
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  authTitle: {
    color: "#f5f7fa",
    fontSize: typography.body,
    fontWeight: "700",
  },
  authBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    overflow: "hidden",
  },
  authBadgeOn: {
    color: "#b9f7d1",
    backgroundColor: "#123622",
  },
  authBadgeOff: {
    color: "#ffd0ca",
    backgroundColor: "#3a1c19",
  },
  authBody: {
    marginBottom: spacing.md,
    color: "#aab6c4",
    fontSize: 13,
    lineHeight: 20,
  },
  input: {
    marginBottom: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: "#344456",
    borderRadius: radius.md,
    backgroundColor: "#0b0f14",
    color: "#f5f7fa",
    fontSize: typography.label,
  },
  compactButton: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "#526578",
    borderRadius: radius.md,
    backgroundColor: "#1a2633",
  },
  connectButton: {
    borderColor: "#2b7aae",
    backgroundColor: "#1d5f8c",
  },
  compactButtonText: {
    color: "#f5f7fa",
    fontSize: 13,
    fontWeight: "700",
  },
  button: {
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 15,
    borderRadius: radius.md,
    backgroundColor: "#1d5f8c",
  },
  secondaryButton: {
    backgroundColor: "#27384b",
  },
  uploadButton: {
    marginBottom: spacing.xl,
    backgroundColor: "#276749",
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: "#f5f7fa",
    fontSize: typography.label,
    fontWeight: "700",
  },
  successCard: {
    marginBottom: spacing.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: "#2d8058",
    borderRadius: radius.lg,
    backgroundColor: "#10281d",
  },
  successTitle: {
    marginBottom: spacing.sm,
    color: "#b9f7d1",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  successText: {
    color: "#d4e9dc",
    fontSize: typography.label,
    lineHeight: 21,
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
