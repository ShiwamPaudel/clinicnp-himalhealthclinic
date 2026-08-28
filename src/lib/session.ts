/**
 * session.ts — server-side session & role guards. Use in server components/actions.
 */
import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Role } from "@/lib/repos/users";

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  canEditRate: boolean;
}

/** Returns the signed-in user or redirects to login. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return {
    id: session.user.id,
    name: session.user.name ?? "",
    role: session.user.role,
    canEditRate: session.user.canEditRate,
  };
}

/** Returns the signed-in admin or redirects (to login if out, to dashboard if staff). */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

/** Who may create bills, returns and holds: everyone except the Accountant,
 *  who is read-only by definition (PRD §4B.8). */
export function canBill(role: Role): boolean {
  return role === "admin" || role === "staff";
}

/** Counter access. An Accountant lands on the dashboard instead. */
export async function requireBillingUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (!canBill(user.role)) redirect("/dashboard");
  return user;
}

/** Reports and registers: Admin and Accountant read every year. */
export function canReadAllYears(role: Role): boolean {
  return role === "admin" || role === "accountant";
}

/** Throws an AuthError-like object for server actions (mapped to plain language). */
export class NotAuthorizedError extends Error {
  code = "not_authorized" as const;
  userMessage = "You don't have permission to do that.";
  constructor() {
    super("not authorized");
  }
}

export async function assertAdmin(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) throw new NotAuthorizedError();
  if (session.user.role !== "admin") throw new NotAuthorizedError();
  return {
    id: session.user.id,
    name: session.user.name ?? "",
    role: session.user.role,
    canEditRate: session.user.canEditRate,
  };
}
