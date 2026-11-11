import { z } from "zod";
import { db } from "@/lib/db";
import { readTvJson, readTvPlaylist, requireTvAdmin, tvAuditData, tvFailure, tvJson, TvError } from "@/lib/tv-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const settingsSchema = z.object({
  brandName: z.string().trim().max(100),
  slogan: z.string().trim().max(160),
  instagramHandle: z.string().trim().regex(/^@?[a-zA-Z0-9._]{0,30}$/),
  accentColor: z.string().regex(/^(?:#[a-fA-F0-9]{6})?$/),
  imageDuration: z.number().int().min(3).max(60),
  fit: z.enum(["contain", "cover"]),
  source: z.enum(["all", "instagram", "upload"]),
  muted: z.boolean(),
  guestUploadsEnabled: z.boolean(),
}).strict().partial().refine(value => Object.keys(value).length > 0);

export async function GET(request: Request) {
  try {
    const scope = await requireTvAdmin(request);
    return tvJson(await readTvPlaylist(scope.establishmentId));
  } catch (error) { return tvFailure(error); }
}

export async function PATCH(request: Request) {
  try {
    const scope = await requireTvAdmin(request, true);
    const parsed = settingsSchema.safeParse(await readTvJson(request));
    if (!parsed.success) throw new TvError("Confira os dados da TV. Use uma duração de 3 a 60 segundos e uma cor hexadecimal válida.");
    const data = {
      ...parsed.data,
      brandName: parsed.data.brandName === undefined ? undefined : parsed.data.brandName || null,
      instagramHandle: parsed.data.instagramHandle?.replace(/^@/, ""),
      accentColor: parsed.data.accentColor === undefined ? undefined : parsed.data.accentColor.toLowerCase() || null,
    };
    await db.$transaction(async tx => {
      const config = await tx.tvConfig.upsert({ where: { establishmentId: scope.establishmentId }, create: { establishmentId: scope.establishmentId, ...data }, update: data });
      await tx.auditEvent.create({ data: tvAuditData(scope, request, "UPDATE", "TvConfig", scope.establishmentId, { brandName: config.brandName, slogan: config.slogan, instagramHandle: config.instagramHandle, accentColor: config.accentColor, imageDuration: config.imageDuration, fit: config.fit, source: config.source, muted: config.muted }) });
    });
    return tvJson(await readTvPlaylist(scope.establishmentId));
  } catch (error) { return tvFailure(error); }
}
