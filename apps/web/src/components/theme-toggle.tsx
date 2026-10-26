/** Shared appearance control for the library, Admin and sign-in pages. */
export function ThemeToggle({ dark, onToggle, label, text }: {
  dark: boolean; onToggle: () => void; label: string; text: string;
}) {
  return <button className="reading-theme-toggle" type="button" aria-label={label} aria-pressed={dark} onClick={onToggle}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20 15.4A8.5 8.5 0 0 1 8.6 4 8.5 8.5 0 1 0 20 15.4Z" />}
    </svg><span>{text}</span>
  </button>;
}
