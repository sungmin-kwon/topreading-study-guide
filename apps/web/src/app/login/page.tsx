import { signIn } from "@/lib/auth-google";
import { AuthScreen } from "@/components/auth-screen";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <AuthScreen error={Boolean(error)} signInAction={async () => {
    "use server";
    await signIn("google", { redirectTo: "/" });
  }} />;
}
