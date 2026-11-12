import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const cookieName = "mordome-public-orders";
export async function publicOrderSession(create = false) {
  const jar = await cookies();
  let token = jar.get(cookieName)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    if (!create) return null;
    token = randomBytes(32).toString("hex");
    jar.set(cookieName, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 90 });
  }
  return createHash("sha256").update(token).digest("hex");
}

