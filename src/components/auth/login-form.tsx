"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { loginBlockStatus } from "@/app/(auth)/actions";
import { strings } from "@/lib/strings";
import { Wordmark } from "@/components/ui/wordmark";

interface FormValues {
  username: string;
  password: string;
}

export function LoginForm({
  appName,
  tagline,
}: {
  appName: string;
  tagline: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>();

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    const res = await signIn("password", {
      username: values.username,
      password: values.password,
      redirect: false,
    });
    setSubmitting(false);
    if (res?.error) {
      // Distinguish a lockout from wrong credentials for a clearer message.
      const status = await loginBlockStatus(values.username);
      if (status.blocked) {
        const mins = Math.ceil(status.retryAfterSec / 60);
        toast.error(
          `Too many attempts. Please wait about ${mins} minute${mins === 1 ? "" : "s"} and try again.`,
        );
      } else {
        toast.error(strings.wrongLogin);
      }
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="w-full max-w-sm rounded-[10px] border border-line bg-cream-50 p-6 shadow-[0_1px_2px_rgb(22_36_27_/_6%),0_4px_12px_rgb(22_36_27_/_5%)]"
    >
      <div className="mb-6 flex flex-col items-center text-center">
        <Wordmark name={appName} className="text-[28px]" />
        <p className="mt-2 text-[13px] text-sage-500">{tagline}</p>
      </div>

      <div className="flex flex-col gap-4">
        <Field
          label={strings.username}
          htmlFor="username"
          error={errors.username && "Enter your username"}
        >
          <Input
            id="username"
            autoFocus
            autoComplete="username"
            {...register("username", { required: true })}
          />
        </Field>
        <Field
          label={strings.password}
          htmlFor="password"
          error={errors.password && "Enter your password"}
        >
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register("password", { required: true })}
          />
        </Field>
        <Button type="submit" disabled={submitting} className="mt-2 w-full">
          {submitting ? "…" : strings.login}
        </Button>
      </div>
    </form>
  );
}
