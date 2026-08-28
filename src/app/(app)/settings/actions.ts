"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin, NotAuthorizedError } from "@/lib/session";
import { saveCompany, getCompany } from "@/lib/repos/company";
import {
  createUser,
  updateUser,
  usernameExists,
} from "@/lib/repos/users";
import {
  companySchema,
  newUserSchema,
  updateUserSchema,
} from "@/lib/validators";

export interface ActionResult {
  ok: boolean;
  userMessage?: string;
}

const OK: ActionResult = { ok: true };

function fail(userMessage: string): ActionResult {
  return { ok: false, userMessage };
}

/** Map any thrown error to a safe, plain-language result (Rules §3). */
function handle(err: unknown): ActionResult {
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  console.error("[settings action]", err);
  return fail("Something went wrong. Please try again.");
}

export async function saveCompanyAction(
  input: unknown,
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const parsed = companySchema.safeParse(input);
    if (!parsed.success) return fail("Please check the details and try again.");
    await saveCompany(parsed.data);
    revalidatePath("/settings/company");
    revalidatePath("/dashboard");
    return OK;
  } catch (err) {
    return handle(err);
  }
}

export async function setCbmsEnabledAction(
  enabled: boolean,
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const company = await getCompany();
    await saveCompany({ ...company, cbmsEnabled: enabled });
    revalidatePath("/settings/compliance");
    return OK;
  } catch (err) {
    return handle(err);
  }
}

export async function createUserAction(input: unknown): Promise<ActionResult> {
  try {
    await assertAdmin();
    const parsed = newUserSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    if (await usernameExists(parsed.data.username)) {
      return fail("That username is already taken.");
    }
    await createUser({
      name: parsed.data.name,
      username: parsed.data.username,
      password: parsed.data.password,
      pin: parsed.data.pin || undefined,
      role: parsed.data.role,
      canEditRate: parsed.data.canEditRate,
    });
    revalidatePath("/settings/users");
    return OK;
  } catch (err) {
    return handle(err);
  }
}

export async function updateUserAction(input: unknown): Promise<ActionResult> {
  try {
    await assertAdmin();
    const parsed = updateUserSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const { id, ...rest } = parsed.data;
    await updateUser(id, {
      name: rest.name,
      role: rest.role,
      canEditRate: rest.canEditRate,
      active: rest.active,
      password: rest.password || undefined,
      pin: rest.pin || undefined,
    });
    revalidatePath("/settings/users");
    return OK;
  } catch (err) {
    return handle(err);
  }
}
