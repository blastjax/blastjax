import { redirect } from "next/navigation";

/** Old URL; calendar lives at `/`. */
export default function CalendarRedirectPage() {
  redirect("/");
}
