import { signIn } from "@/lib/auth-google";
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main style={{ maxWidth: 420, margin: "12vh auto", padding: 24 }}>
    <h1>TopReading</h1><p>Sign in to your library.</p>
    {error && <p role="alert">Sign-in was not completed. Use your invited Google account, or contact your library administrator.</p>}
    <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}><button type="submit">Continue with Google</button></form>
  </main>;
}
