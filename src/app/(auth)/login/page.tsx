import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/login-form";
import { DEFAULT_APP_NAME, appDescriptionFor } from "@/lib/app-name";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  // Milestone 2 swaps these for the real module flags via getModules().
  return (
    <LoginForm
      appName={DEFAULT_APP_NAME}
      tagline={appDescriptionFor({ pharmacy: true, clinic: true })}
    />
  );
}
