import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth";

export async function GET() {
  const [userCount, session] = await Promise.all([db.user.count(), getCurrentSession()]);
  return Response.json({ needsSetup: userCount === 0, session });
}
