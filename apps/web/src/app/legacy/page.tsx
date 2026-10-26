import { redirect } from "next/navigation";

// Keep old bookmarks usable after retiring the temporary fallback interface.
export default function LegacyPage() {
  redirect("/");
}
