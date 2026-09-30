import { z } from "zod";
import { db } from "@/lib/db";

const responseSchema = z.object({ status: z.literal("ok"), service: z.literal("mordome"), timestamp: z.string().datetime() });

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json(responseSchema.parse({ status: "ok", service: "mordome", timestamp: new Date().toISOString() }));
  } catch {
    return Response.json({ status: "unavailable", service: "mordome", timestamp: new Date().toISOString() }, { status: 503 });
  }
}
