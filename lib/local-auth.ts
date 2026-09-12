import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";

const LOCAL_TOKEN = randomBytes(32).toString("base64url");
const LOCAL_ESTABLISHMENT_COOKIE = "mordome_local_establishment";
const localEstablishments = [
  { id: "parque-aeroporto", name: "Parque Aeroporto" },
  { id: "anexo", name: "Anexo" },
  { id: "cavaleiros", name: "Cavaleiros" },
  { id: "lagomar", name: "Lagomar" },
];

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
  const cookieStore = await cookies(); cookieStore.delete(SESSION_COOKIE); cookieStore.delete(LOCAL_ESTABLISHMENT_COOKIE);
}

function isValidLocalToken(token: string | undefined) {
  if (!token) return false;
  const received = Buffer.from(token);
  const expected = Buffer.from(LOCAL_TOKEN);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function getLocalSession() {
  const cookieStore = await cookies();
  if (!isValidLocalToken(cookieStore.get(SESSION_COOKIE)?.value)) return null;
  const selectedId = cookieStore.get(LOCAL_ESTABLISHMENT_COOKIE)?.value;
  const establishment = localEstablishments.find(item => item.id === selectedId) ?? localEstablishments[0];
  return {
    sessionId: "local",
    user: { id: "local-admin", name: "Administrador Betão", username: process.env.LOCAL_AUTH_USERNAME ?? "betao" },
    organization: { id: "local-betao", name: "Betão Hot Dog" },
    establishment,
    establishments: localEstablishments,
  };
}

export async function selectLocalEstablishment(establishmentId: string) {
  if (!localEstablishments.some(item => item.id === establishmentId)) return false;
  (await cookies()).set(LOCAL_ESTABLISHMENT_COOKIE, establishmentId, { httpOnly: true, sameSite: "lax", secure: false, path: "/" });
  return true;
}
