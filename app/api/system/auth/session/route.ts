import { getSystemAdminSession } from "@/lib/system-auth";
export async function GET() { return Response.json({ session: await getSystemAdminSession() }); }
