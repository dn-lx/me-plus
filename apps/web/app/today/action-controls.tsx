"use client";

import { useActionState } from "react";
import { recordActionDecision, type ActionDecisionState } from "./action-decisions";

const initial: ActionDecisionState = { ok: false, message: "" };

export function ActionControls({ id, title }: { id: string; title?: string }) {
  const [state, submit, pending] = useActionState(recordActionDecision, initial);

  const actionLabel = title ? `for "${title}"` : "";

  return (
    <form action={submit} className="actionForm">
      <input type="hidden" name="action_id" value={id} />
      <div className="actionBtnRow" role="group" aria-label="Action decision controls">
        <button
          disabled={pending}
          type="submit"
          name="decision"
          value="completed"
          className="actionBtn btnComplete"
          aria-label={`Mark complete ${actionLabel}`}
        >
          {pending ? "Saving…" : "Complete"}
        </button>
        <button
          disabled={pending}
          type="submit"
          name="decision"
          value="partial"
          className="actionBtn btnPartial"
          aria-label={`Mark partial progress ${actionLabel}`}
        >
          Partial
        </button>
        <button
          disabled={pending}
          type="submit"
          name="decision"
          value="skipped"
          className="actionBtn btnSkip"
          aria-label={`Skip ${actionLabel}`}
        >
          Skip
        </button>
      </div>
      {state.message ? (
        <p
          role="status"
          className={`statusMessage ${state.ok ? "statusSuccess" : "statusError"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
