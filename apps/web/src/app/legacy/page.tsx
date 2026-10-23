import { BookWorkspace } from "@/components/book-workspace";

// Temporary fallback while the live editorial interface is being validated.
export default function LegacyPage() {
  return <BookWorkspace modern={false} />;
}
