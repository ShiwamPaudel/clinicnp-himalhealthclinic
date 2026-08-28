import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/login-form";
import { appNameFor, appDescriptionFor } from "@/lib/app-name";
import { getModules } from "@/lib/modules";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const modules = await getModules();
  return (
    <LoginForm
      appName={appNameFor(modules)}
      tagline={appDescriptionFor(modules)}
    />
  );
}
