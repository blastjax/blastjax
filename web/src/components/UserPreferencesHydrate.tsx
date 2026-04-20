"use client";

import { useEffect } from "react";
import { hydrateUserPreferencesFromApi } from "@/lib/userPreferencesPersistence";

/** Loads UI prefs from the API once; merges into localStorage and notifies subscribers. */
export function UserPreferencesHydrate() {
  useEffect(() => {
    void hydrateUserPreferencesFromApi();
  }, []);
  return null;
}
