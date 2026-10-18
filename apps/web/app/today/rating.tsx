"use client";

import { useActionState } from "react";
import { rateRecommendation, type FeedbackState } from "./actions";

const initial: FeedbackState = { ok: false, message: "" };

export function RecommendationRating({ id }: { id: string }) {
  const [state, action, pending] = useActionState(rateRecommendation, initial);

  return (
    <form action={action} aria-label="Rate recommendation usefulness" style={{ marginTop: 12 }}>
      <input type="hidden" name="recommendation_id" value={id} />
      <fieldset
        disabled={pending}
        style={{ border: 0, padding: 0, margin: "8px 0" }}
      >
        <legend style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 8 }}>
          How useful was this recommendation?
        </legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="submit"
              name="stars"
              value={n}
              aria-label={`Rate ${n} out of 5 stars`}
              className="actionBtn btnSkip"
              style={{
                minHeight: 44,
                minWidth: 44,
                padding: "8px 14px",
                fontSize: "0.9rem",
              }}
            >
              {n} ★
            </button>
          ))}
        </div>
      </fieldset>
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
