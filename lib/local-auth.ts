import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";

const LOCAL_TOKEN = "mordome-local-betao";

export function isLocalAuthEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.LOCAL_AUTH_ENABLED === "true";
}

export function localCredentialsAreValid(username: string, password: string) {
  const expectedUsername = process.env.LOCAL_AUTH_USERNAME ?? "";
  const expectedPassword = process.env.LOCAL_AUTH_PASSWORD ?? "";
  const received = Buffer.from(`${username}\0${password}`);
  const expected = Buffer.from(`${expectedUsername}\0${expectedPassword}`);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function createLocalSession() {
  (await cookies()).set(SESSION_COOKIE, LOCAL_TOKEN, { httpOnly: true, sameSite: "lax", secure: false, path: "/" });
}

export async function destroyLocalSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getLocalSession() {
  if ((await cookies()).get(SESSION_COOKIE)?.value !== LOCAL_TOKEN) return null;
  return {
    sessionId: "local",
    user: { id: "local-admin", name: "Administrador Betão", username: process.env.LOCAL_AUTH_USERNAME ?? "betao" },
    organization: { id: "local-betao", name: "Betão Hot Dog" },
    establishment: { id: "local-matriz", name: "Betão Hot Dog" },
  };
}
