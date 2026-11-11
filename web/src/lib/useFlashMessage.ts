"use client";

import { useEffect, useState } from "react";

// A status line ("Saved.") that clears itself after a moment.
export function useFlashMessage(ms = 2800) {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), ms);
    return () => window.clearTimeout(timer);
  }, [message, ms]);
  return [message, setMessage] as const;
}
