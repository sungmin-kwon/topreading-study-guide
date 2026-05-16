export default function SignedOutPage() {
  return (
    <main className="auth-landing">
      <section className="auth-landing-panel">
        <div className="auth-landing-brand">
          <span className="brand-mark">TR</span>
          <div>
            <p className="eyebrow">TopReading</p>
            <h1>Signed out</h1>
          </div>
        </div>
        <p>
          You have been signed out of the study guide workspace. Sign in again to manage books,
          generate study sets, or export handouts.
        </p>
        <div className="auth-landing-actions">
          <a href="/">Log in</a>
        </div>
      </section>
    </main>
  );
}
