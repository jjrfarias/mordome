import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";

export async function GET() {
  if (isLocalAuthEnabled()) return Response.json({ needsSetup: false, session: await getLocalSession() });
  const [userCount, session] = await Promise.all([db.user.count(), getCurrentSession()]);
  return Response.json({ needsSetup: userCount === 0, session });
}
