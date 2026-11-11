import { TV_INSTAGRAM_ENABLED } from "@/lib/tv-features";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { connectTvInstagramAccount } from "@/lib/tv-instagram";
import { encryptTvToken, readTvJson, requireTvAdmin, tvAuditData, tvFailure, tvJson, tvStoriesJson, TvError } from "@/lib/tv-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const connectionSchema = z.object({
  accessToken: z.string().trim().min(20).max(8192).regex(/^[^\s\u0000-\u001f\u007f]+$/),
  accountId: z.string().trim().regex(/^(?:\d{5,30})?$/).optional(),
  accessMode: z.enum(["unified", "facebook"]).default("unified"),
}).strict();

export async function POST(request: Request) {
  try {
    const scope = await requireTvAdmin(request, true);
    if (!TV_INSTAGRAM_ENABLED) throw new TvError("A integração com o Instagram está pausada. Envie fotos e vídeos para a TV.", 503);
    const parsed = connectionSchema.safeParse(await readTvJson(request));
    if (!parsed.success) throw new TvError("Informe um token válido, o método de conexão e, se necessário, o ID numérico do Instagram profissional.");
    if (!rateLimit(`tv:instagram:${scope.establishmentId}`, 10, 60_000).allowed) throw new TvError("Aguarde um minuto antes de tentar conectar novamente.", 429);
    const encryptedToken = encryptTvToken(parsed.data.accessToken, scope.establishmentId);
    const connection = await connectTvInstagramAccount(parsed.data);
    const now = new Date();
    const connectionData = {
      instagramAccountId: connection.accountId,
      instagramUsername: connection.username,
      instagramAccessMode: parsed.data.accessMode,
      instagramEncryptedToken: encryptedToken,
      instagramTokenExpiresAt: null,
      instagramClientBusinessId: null,
      instagramSystemUserId: null,
      instagramConfigId: null,
      instagramReconnectRequired: false,
      instagramTokenRefreshAttemptAt: null,
      instagramConnectedAt: now,
      instagramLastAttemptAt: now,
      instagramSyncedAt: now,
      instagramRefreshLeaseUntil: null,
      instagramLastError: null,
      instagramStories: tvStoriesJson(connection.stories),
    };
    await db.$transaction(async tx => {
      await tx.tvInstagramAuthorization.deleteMany({ where: { establishmentId: scope.establishmentId } });
      const previous = await tx.tvConfig.findUnique({ where: { establishmentId: scope.establishmentId }, select: { instagramAccountId: true } });
      await tx.tvConfig.upsert({ where: { establishmentId: scope.establishmentId }, create: { establishmentId: scope.establishmentId, ...connectionData }, update: connectionData });
      if (previous?.instagramAccountId !== connection.accountId) await tx.tvStoryPreference.deleteMany({ where: { establishmentId: scope.establishmentId } });
      await tx.auditEvent.create({ data: tvAuditData(scope, request, "UPDATE", "TvInstagramConnection", scope.establishmentId, { connected: true, accountId: connection.accountId, username: connection.username, accessMode: parsed.data.accessMode, storyCount: connection.stories.length }) });
    });
    return tvJson({ connected: true, username: connection.username, storyCount: connection.stories.length });
  } catch (error) { return tvFailure(error); }
}

export async function DELETE(request: Request) {
  try {
    const scope = await requireTvAdmin(request, true);
    await db.$transaction(async tx => {
      await tx.tvInstagramAuthorization.deleteMany({ where: { establishmentId: scope.establishmentId } });
      await tx.tvConfig.updateMany({ where: { establishmentId: scope.establishmentId }, data: { instagramTokenExpiresAt: null, instagramClientBusinessId: null, instagramSystemUserId: null, instagramConfigId: null, instagramReconnectRequired: false, instagramTokenRefreshAttemptAt: null } });
      await tx.tvConfig.updateMany({ where: { establishmentId: scope.establishmentId }, data: { instagramAccountId: null, instagramUsername: null, instagramAccessMode: null, instagramEncryptedToken: null, instagramConnectedAt: null, instagramLastAttemptAt: null, instagramSyncedAt: null, instagramRefreshLeaseUntil: null, instagramLastError: null, instagramStories: [] } });
      await tx.tvStoryPreference.deleteMany({ where: { establishmentId: scope.establishmentId } });
      await tx.auditEvent.create({ data: tvAuditData(scope, request, "DELETE", "TvInstagramConnection", scope.establishmentId, { connected: false }) });
    });
    return tvJson({ connected: false });
  } catch (error) { return tvFailure(error); }
}
