type AvailabilityState = "loading" | "empty" | "unavailable";

interface AvailabilityStateProps {
  state: AvailabilityState;
  message?: string;
  onRetry?: () => void;
}

export function AvailabilityState({ state, message, onRetry }: AvailabilityStateProps) {
  if (state === "loading") {
    return (
      <div className="availability-state" role="status" aria-live="polite">
        Checking verified availability…
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="availability-state" role="status">
        No verified slots are available for those constraints.
      </div>
    );
  }

  return (
    <div className="availability-state availability-state-error" role="alert">
      <span>{message || "Verified availability is temporarily unavailable."}</span>
      {onRetry && (
        <button type="button" className="inline-retry-btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
