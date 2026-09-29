"use client";

import { useEffect } from "react";
import { CARD_CLASSES, SECONDARY_BUTTON_CLASSES } from "@/lib/ui";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className={`${CARD_CLASSES} flex max-w-md flex-col items-center gap-4 text-center`}>
      <h1 className="text-lg font-semibold tracking-[-0.2px] text-ink">
        Something went wrong
      </h1>
      <p className="text-sm text-ink-3">
        {process.env.NODE_ENV === "development" && error.message
          ? error.message
          : "An error occurred while rendering this page. Try again, or reload the app."}
      </p>
      {process.env.NODE_ENV === "development" && error.digest ? (
        <p className="font-mono text-xs text-ink-4">digest: {error.digest}</p>
      ) : null}
      <button
        type="button"
        className={SECONDARY_BUTTON_CLASSES}
        onClick={() => reset()}
      >
        Try again
      </button>
      </div>
    </div>
  );
}
