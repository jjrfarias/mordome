import { z } from "zod";

const responseSchema = z.object({ status: z.literal("ok"), service: z.literal("mordome"), timestamp: z.string().datetime() });

export async function GET() {
  return Response.json(responseSchema.parse({ status: "ok", service: "mordome", timestamp: new Date().toISOString() }));
}
