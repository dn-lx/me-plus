import { radius, spacing, typography } from "@me-plus/ui";
import { Link } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ActionDecisionType, TodayAction, TodayState } from "./types.ts";

export type TodayViewProps = {
  state: TodayState;
  onRefresh: () => void | Promise<unknown>;
  onDecision: (actionId: string, decision: ActionDecisionType) => void | Promise<unknown>;
  onSignIn: (email: string, password: string) => Promise<{ ok: boolean; message: string }>;
  onSignOut: () => Promise<{ ok: boolean; message: string }>;
};

const PRIORITY_GROUPS = [
  { key: "must", label: "Must" },
  { key: "should", label: "Should" },
  { key: "bonus", label: "Bonus" },
] as const;

export function TodayView({
  state,
  onRefresh,
  onDecision,
  onSignIn,
  onSignOut,
}: TodayViewProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authFeedback, setAuthFeedback] = useState<string | null>(null);

  const isCheckingSession =
    state.status === "idle" || (state.status === "loading" && state.userId === null);
  const isAuthenticated = state.userId !== null;
  const isRefreshing = state.status === "loading" && isAuthenticated;
  const isReadOnly = state.status !== "ready" || state.isStale;

  async function handleSignIn() {
    if (!email.trim() || !password) {
      setAuthFeedback("Enter your Me+ email and password first.");
      return;
    }
    setAuthBusy(true);
    setAuthFeedback(null);
    try {
      const result = await onSignIn(email, password);
      if (result.ok) {
        setPassword("");
        setAuthFeedback(null);
      } else {
        setAuthFeedback(result.message);
      }
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    setAuthBusy(true);
    try {
      const result = await onSignOut();
      setAuthFeedback(result.ok ? null : result.message);
    } finally {
      setAuthBusy(false);
    }
  }

  function formatTime(isoString: string | null) {
    if (!isoString) return "";
    try {
      return new Date(isoString).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return "";
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.eyebrow}>ME+ TODAY</Text>
          {isCheckingSession ? (
            <View style={[styles.authBadge, styles.authBadgeChecking]}>
              <Text style={[styles.authBadgeText, styles.authBadgeCheckingText]}>
                CHECKING SESSION
              </Text>
            </View>
          ) : isAuthenticated ? (
            <View style={styles.authBadge}>
              <Text style={styles.authBadgeText}>CONNECTED</Text>
            </View>
          ) : (
            <View style={[styles.authBadge, styles.authBadgeOff]}>
              <Text style={[styles.authBadgeText, styles.authBadgeOffText]}>SIGNED OUT</Text>
            </View>
          )}
        </View>
        <Text style={styles.title}>Your daily priorities</Text>
        <Text style={styles.lede}>
          One system for your daily context, insights and commitments.
        </Text>

        {isAuthenticated && (
          <View style={styles.syncRow}>
            <Text style={styles.refreshLabel}>
              {state.refreshedAt
                ? `Refreshed at ${formatTime(state.refreshedAt)}`
                : "Awaiting sync"}
            </Text>
            <View style={styles.headerButtons}>
              <Pressable
                accessibilityLabel="Refresh Today items from Me+"
                accessibilityRole="button"
                disabled={isRefreshing}
                onPress={() => void onRefresh()}
                style={[styles.smallButton, isRefreshing && styles.buttonDisabled]}
              >
                {isRefreshing ? (
                  <ActivityIndicator color="#f5f7fa" size="small" />
                ) : (
                  <Text style={styles.smallButtonText}>Refresh</Text>
                )}
              </Pressable>
              <Pressable
                accessibilityLabel="Disconnect account from this phone"
                accessibilityRole="button"
                disabled={authBusy}
                onPress={handleSignOut}
                style={[
                  styles.smallButton,
                  styles.disconnectButton,
                  authBusy && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.disconnectButtonText}>Sign out</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* Checking Session State */}
      {isCheckingSession && (
        <View style={styles.sessionCheckingCard}>
          <ActivityIndicator color="#8fc8fa" style={{ marginBottom: spacing.sm }} />
          <Text style={styles.sessionCheckingTitle}>Checking Me+ session…</Text>
          <Text style={styles.sessionCheckingBody}>
            Restoring your secure local connection to Me+.
          </Text>
        </View>
      )}

      {/* Signed Out State / Sign In Card */}
      {!isCheckingSession && !isAuthenticated && (
        <View style={styles.authCard}>
          <Text style={styles.authCardTitle}>Connect your Me+ account</Text>
          <Text style={styles.authCardBody}>
            Sign in to view your today priorities and record action decisions on this phone.
          </Text>
          <TextInput
            accessibilityLabel="Me+ email address"
            autoCapitalize="none"
            autoComplete="email"
            editable={!authBusy}
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="Me+ email"
            placeholderTextColor="#68798b"
            style={styles.input}
            value={email}
          />
          <TextInput
            accessibilityLabel="Password"
            autoCapitalize="none"
            autoComplete="password"
            editable={!authBusy}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor="#68798b"
            secureTextEntry
            style={styles.input}
            value={password}
          />
          {authFeedback ? <Text style={styles.errorText}>{authFeedback}</Text> : null}
          <Pressable
            accessibilityLabel="Connect phone to Me+"
            accessibilityRole="button"
            disabled={authBusy}
            onPress={handleSignIn}
            style={[styles.button, styles.primaryButton, authBusy && styles.buttonDisabled]}
          >
            {authBusy ? (
              <ActivityIndicator color="#f5f7fa" />
            ) : (
              <Text style={styles.buttonText}>Connect phone to Me+</Text>
            )}
          </Pressable>
        </View>
      )}

      {/* Global Error Banner */}
      {state.errorMessage && (
        <View style={styles.errorCard} role="alert">
          <Text style={styles.errorTitle}>Could not load priorities</Text>
          <Text style={styles.errorBody}>{state.errorMessage}</Text>
          <Pressable
            accessibilityLabel="Retry loading Today priorities"
            accessibilityRole="button"
            onPress={() => void onRefresh()}
            style={[styles.smallButton, styles.retryButton]}
          >
            <Text style={styles.smallButtonText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {/* Stale / Refreshing Status Notice */}
      {isAuthenticated && isRefreshing && (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeText}>Refreshing priorities from Me+…</Text>
        </View>
      )}

      {isAuthenticated && state.isStale && !isRefreshing && (
        <View style={styles.staleNoticeCard}>
          <Text style={styles.staleNoticeText}>
            Priorities may be out of date. Tap Refresh to update before taking action.
          </Text>
        </View>
      )}

      {/* Authenticated Today Surface */}
      {isAuthenticated && (
        <>
          {/* What Matters Now */}
          <View style={styles.nowCard}>
            <Text style={styles.nowEyebrow}>WHAT MATTERS NOW</Text>
            {state.nowAction ? (
              <>
                <Text style={styles.nowTitle}>{state.nowAction.title}</Text>
                <View style={styles.nowMetaRow}>
                  <Text style={styles.nowPriorityBadge}>
                    {state.nowAction.priority.toUpperCase()}
                  </Text>
                  {state.nowAction.estimated_minutes ? (
                    <Text style={styles.nowMetaText}>
                      {state.nowAction.estimated_minutes} min
                    </Text>
                  ) : null}
                  {state.minutesAvailable !== null && !state.busyNow ? (
                    <Text style={styles.nowMetaText}>
                      · {state.minutesAvailable} min until commitment
                    </Text>
                  ) : null}
                </View>
                {state.nowAction.instructions ? (
                  <Text style={styles.nowInstructions}>{state.nowAction.instructions}</Text>
                ) : null}
                <ActionControls
                  action={state.nowAction}
                  actionMessage={state.actionMessage}
                  disabled={isReadOnly}
                  onDecision={onDecision}
                  submittingActionId={state.submittingActionId}
                />
              </>
            ) : (
              <View style={styles.nowEmptyState}>
                <Text style={styles.nowEmptyText}>
                  {state.calendarUnavailable
                    ? "Calendar schedule is unavailable. We cannot determine what fits right now."
                    : state.busyNow
                    ? "You are currently in a scheduled commitment."
                    : state.actions.length > 0
                    ? "No ready action fits your current calendar window."
                    : "No active actions are currently available."}
                </Text>
                {state.minutesAvailable !== null &&
                !state.busyNow &&
                !state.calendarUnavailable ? (
                  <Text style={styles.nowWindowText}>
                    {state.minutesAvailable} minutes until your next commitment
                  </Text>
                ) : null}
              </View>
            )}
          </View>

          {/* Action Priorities Groups */}
          <Text style={styles.sectionHeader}>Today priorities</Text>
          {PRIORITY_GROUPS.map(({ key, label }) => {
            const items = state.actions.filter((a) => a.priority === key);
            return (
              <View key={key} style={styles.priorityGroup}>
                <View style={styles.priorityHeaderRow}>
                  <Text style={styles.priorityGroupTitle}>{label}</Text>
                  <Text style={styles.priorityCount}>({items.length})</Text>
                </View>
                {items.length === 0 ? (
                  <Text style={styles.emptyGroupText}>Nothing here right now.</Text>
                ) : (
                  items.map((action) => (
                    <View key={action.id} style={styles.actionCard}>
                      <Text style={styles.actionTitle}>{action.title}</Text>
                      <View style={styles.actionMetaRow}>
                        <Text style={styles.actionStatusText}>{action.status}</Text>
                        {action.estimated_minutes ? (
                          <Text style={styles.actionMetaDot}>· {action.estimated_minutes} min</Text>
                        ) : null}
                      </View>
                      {action.instructions ? (
                        <Text style={styles.actionInstructions}>{action.instructions}</Text>
                      ) : null}
                      <ActionControls
                        action={action}
                        actionMessage={state.actionMessage}
                        disabled={isReadOnly}
                        onDecision={onDecision}
                        submittingActionId={state.submittingActionId}
                      />
                    </View>
                  ))
                )}
              </View>
            );
          })}

          {/* Guidance Section */}
          <View style={styles.guidanceSection}>
            <Text style={styles.sectionHeader}>Guidance</Text>
            {state.guidance.length === 0 ? (
              <Text style={styles.emptyGuidanceText}>No recent recommendations.</Text>
            ) : (
              state.guidance.map((recommendation) => (
                <View key={recommendation.id} style={styles.guidanceCard}>
                  <Text style={styles.guidanceTitle}>{recommendation.title}</Text>
                  {recommendation.rationale ? (
                    <Text style={styles.guidanceRationale}>{recommendation.rationale}</Text>
                  ) : null}
                  <Text style={styles.guidanceMeta}>
                    Confidence: {recommendation.confidence ?? "not available"}
                  </Text>
                </View>
              ))
            )}
          </View>
        </>
      )}

      {/* Preserve Device Tools Navigation */}
      <Text style={styles.sectionHeader}>Device tools</Text>
      <Link href="/health-connect" asChild>
        <Pressable
          accessibilityHint="Navigates to the live Health Connect screen"
          accessibilityLabel="Live Health Connect: Inventory watch data"
          accessibilityRole="button"
          style={styles.healthCard}
        >
          <Text style={styles.healthEyebrow}>LIVE HEALTH CONNECT</Text>
          <Text style={styles.healthTitle}>Inventory watch data</Text>
          <Text style={styles.healthBody}>
            Grant read access and inspect exactly which Health Connect record types and source origins are available from your phone.
          </Text>
        </Pressable>
      </Link>

      <Link href="/sensor-diagnostics" asChild>
        <Pressable
          accessibilityHint="Navigates to the sensor pipeline test harness"
          accessibilityLabel="Pipeline Test Harness: Run fixture diagnostics"
          accessibilityRole="button"
          style={styles.diagnosticsCard}
        >
          <Text style={styles.diagnosticsEyebrow}>PIPELINE TEST HARNESS</Text>
          <Text style={styles.diagnosticsTitle}>Run fixture diagnostics</Text>
          <Text style={styles.diagnosticsBody}>
            Exercise exact, missing, changed-value and duplicate fixtures without touching real health data.
          </Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}

function ActionControls({
  action,
  submittingActionId,
  actionMessage,
  disabled,
  onDecision,
}: {
  action: TodayAction;
  submittingActionId: string | null;
  actionMessage: { actionId: string; text: string; isError: boolean } | null;
  disabled: boolean;
  onDecision: (actionId: string, decision: ActionDecisionType) => void;
}) {
  const isSubmittingThis = submittingActionId === action.id;
  const isAnySubmitting = submittingActionId !== null;
  const isActionDisabled = isAnySubmitting || disabled;
  const hasFeedback = actionMessage?.actionId === action.id;

  return (
    <View style={styles.controlsContainer}>
      <View style={styles.decisionRow}>
        <Pressable
          accessibilityLabel={`Mark complete: ${action.title}`}
          accessibilityRole="button"
          disabled={isActionDisabled}
          onPress={() => onDecision(action.id, "completed")}
          style={[
            styles.decisionButton,
            styles.completeButton,
            isActionDisabled && styles.buttonDisabled,
          ]}
        >
          {isSubmittingThis ? (
            <ActivityIndicator color="#f5f7fa" size="small" />
          ) : (
            <Text style={styles.decisionButtonText}>Complete</Text>
          )}
        </Pressable>

        <Pressable
          accessibilityLabel={`Mark partial: ${action.title}`}
          accessibilityRole="button"
          disabled={isActionDisabled}
          onPress={() => onDecision(action.id, "partial")}
          style={[
            styles.decisionButton,
            styles.partialButton,
            isActionDisabled && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.decisionButtonText}>Partial</Text>
        </Pressable>

        <Pressable
          accessibilityLabel={`Skip action: ${action.title}`}
          accessibilityRole="button"
          disabled={isActionDisabled}
          onPress={() => onDecision(action.id, "skipped")}
          style={[
            styles.decisionButton,
            styles.skipButton,
            isActionDisabled && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.decisionButtonText}>Skip</Text>
        </Pressable>
      </View>

      {hasFeedback && (
        <Text
          accessibilityRole="alert"
          style={[
            styles.feedbackText,
            actionMessage.isError ? styles.feedbackError : styles.feedbackSuccess,
          ]}
        >
          {actionMessage.text}
        </Text>
      )}
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
  header: {
    marginBottom: spacing.xl,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  eyebrow: {
    color: "#9db7d5",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.8,
  },
  authBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#123622",
  },
  authBadgeText: {
    color: "#b9f7d1",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  authBadgeChecking: {
    backgroundColor: "#142536",
  },
  authBadgeCheckingText: {
    color: "#8fc8fa",
  },
  authBadgeOff: {
    backgroundColor: "#3a1c19",
  },
  authBadgeOffText: {
    color: "#ffd0ca",
  },
  title: {
    marginBottom: spacing.xs,
    color: "#f5f7fa",
    fontSize: typography.title,
    fontWeight: "700",
    lineHeight: 36,
  },
  lede: {
    marginBottom: spacing.md,
    color: "#b8c2cf",
    fontSize: typography.body,
    lineHeight: 24,
  },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  refreshLabel: {
    color: "#8fc8fa",
    fontSize: 12,
    fontWeight: "600",
  },
  headerButtons: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  smallButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#1a2633",
    borderWidth: 1,
    borderColor: "#3d546b",
  },
  smallButtonText: {
    color: "#f5f7fa",
    fontSize: 13,
    fontWeight: "700",
  },
  disconnectButton: {
    backgroundColor: "#291a1a",
    borderColor: "#5c3333",
  },
  disconnectButtonText: {
    color: "#ffc2bc",
    fontSize: 13,
    fontWeight: "700",
  },
  retryButton: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
  },
  sessionCheckingCard: {
    marginBottom: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: "#101d2b",
    borderWidth: 1,
    borderColor: "#203a55",
    alignItems: "center",
  },
  sessionCheckingTitle: {
    color: "#f5f7fa",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  sessionCheckingBody: {
    color: "#9db7d5",
    fontSize: 13,
    textAlign: "center",
  },
  authCard: {
    marginBottom: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: "#101821",
    borderWidth: 1,
    borderColor: "#273343",
  },
  authCardTitle: {
    marginBottom: spacing.xs,
    color: "#f5f7fa",
    fontSize: 18,
    fontWeight: "700",
  },
  authCardBody: {
    marginBottom: spacing.md,
    color: "#aab6c4",
    fontSize: typography.label,
    lineHeight: 20,
  },
  input: {
    minHeight: 48,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: "#344456",
    borderRadius: radius.md,
    backgroundColor: "#0b0f14",
    color: "#f5f7fa",
    fontSize: typography.label,
  },
  button: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "#1d5f8c",
  },
  primaryButton: {
    marginTop: spacing.xs,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#f5f7fa",
    fontSize: typography.label,
    fontWeight: "700",
  },
  errorCard: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#2e1514",
    borderWidth: 1,
    borderColor: "#8f3e36",
  },
  errorTitle: {
    color: "#ffd0ca",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  errorBody: {
    color: "#f0b8b2",
    fontSize: 13,
    lineHeight: 18,
  },
  errorText: {
    color: "#ffb4aa",
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  noticeCard: {
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: "#11263a",
    borderWidth: 1,
    borderColor: "#244d73",
  },
  noticeText: {
    color: "#8fc8fa",
    fontSize: 12,
    textAlign: "center",
  },
  staleNoticeCard: {
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: "#362e15",
    borderWidth: 1,
    borderColor: "#6e5d2c",
  },
  staleNoticeText: {
    color: "#ffd885",
    fontSize: 12,
    textAlign: "center",
  },
  nowCard: {
    marginBottom: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: "#122030",
    borderWidth: 1,
    borderColor: "#2a5175",
  },
  nowEyebrow: {
    marginBottom: spacing.xs,
    color: "#8fc8fa",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  nowTitle: {
    marginBottom: spacing.xs,
    color: "#f5f7fa",
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 28,
  },
  nowMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  nowPriorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: "#1a3959",
    color: "#badeff",
    fontSize: 11,
    fontWeight: "800",
  },
  nowMetaText: {
    color: "#9ebcd9",
    fontSize: 13,
  },
  nowInstructions: {
    marginBottom: spacing.md,
    color: "#d0e2f2",
    fontSize: typography.label,
    lineHeight: 20,
  },
  nowEmptyState: {
    paddingVertical: spacing.xs,
  },
  nowEmptyText: {
    color: "#b0c5da",
    fontSize: typography.body,
    lineHeight: 22,
  },
  nowWindowText: {
    marginTop: spacing.xs,
    color: "#8fc8fa",
    fontSize: 12,
    fontWeight: "600",
  },
  sectionHeader: {
    marginBottom: spacing.sm,
    color: "#f5f7fa",
    fontSize: 20,
    fontWeight: "700",
  },
  priorityGroup: {
    marginBottom: spacing.lg,
  },
  priorityHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  priorityGroupTitle: {
    color: "#f5f7fa",
    fontSize: 16,
    fontWeight: "700",
  },
  priorityCount: {
    color: "#9db7d5",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyGroupText: {
    color: "#748496",
    fontSize: typography.label,
    fontStyle: "italic",
    paddingVertical: spacing.xs,
  },
  actionCard: {
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#141c27",
    borderWidth: 1,
    borderColor: "#273343",
  },
  actionTitle: {
    color: "#f5f7fa",
    fontSize: typography.body,
    fontWeight: "700",
    marginBottom: 4,
  },
  actionMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  actionStatusText: {
    color: "#9daab9",
    fontSize: 13,
    textTransform: "capitalize",
  },
  actionMetaDot: {
    color: "#9daab9",
    fontSize: 13,
    marginLeft: 4,
  },
  actionInstructions: {
    marginBottom: spacing.sm,
    color: "#c5ced9",
    fontSize: typography.label,
    lineHeight: 19,
  },
  controlsContainer: {
    marginTop: spacing.xs,
  },
  decisionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  decisionButton: {
    minHeight: 44,
    minWidth: 80,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  completeButton: {
    backgroundColor: "#163826",
    borderColor: "#2a6946",
  },
  partialButton: {
    backgroundColor: "#362e15",
    borderColor: "#6e5d2c",
  },
  skipButton: {
    backgroundColor: "#232b35",
    borderColor: "#3c4a5c",
  },
  decisionButtonText: {
    color: "#f5f7fa",
    fontSize: 13,
    fontWeight: "700",
  },
  feedbackText: {
    marginTop: spacing.xs,
    fontSize: 13,
  },
  feedbackSuccess: {
    color: "#9de5bb",
  },
  feedbackError: {
    color: "#ffb4aa",
  },
  guidanceSection: {
    marginBottom: spacing.xl,
  },
  emptyGuidanceText: {
    color: "#748496",
    fontSize: typography.label,
    fontStyle: "italic",
    paddingVertical: spacing.xs,
  },
  guidanceCard: {
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#141c27",
    borderWidth: 1,
    borderColor: "#273343",
  },
  guidanceTitle: {
    color: "#f5f7fa",
    fontSize: typography.body,
    fontWeight: "700",
    marginBottom: 4,
  },
  guidanceRationale: {
    color: "#c5ced9",
    fontSize: typography.label,
    lineHeight: 20,
    marginBottom: 4,
  },
  guidanceMeta: {
    color: "#8fc8fa",
    fontSize: 12,
  },
  healthCard: {
    marginBottom: spacing.md,
    minHeight: 44,
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
    minHeight: 44,
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
});
