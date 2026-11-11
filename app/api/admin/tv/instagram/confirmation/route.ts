import { z } from "zod";
import { db } from "@/lib/db";
import { connectTvInstagramAccount } from "@/lib/tv-instagram";
import { instagramAccounts, pendingInstagramAuthorization } from "@/lib/tv-instagram-authorization";
import { decryptTvToken, readTvJson, requireTvAdmin, tvAuditData, tvFailure, tvJson, tvStoriesJson, TvError } from "@/lib/tv-server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const scope = await requireTvAdmin(request);
    const pending = await pendingInstagramAuthorization(scope);
    return tvJson({ accounts: pending ? instagramAccounts(pending.accounts) : [] });
  } catch (error) { return tvFailure(error); }
}
export async function POST(request: Request) {
  try {
    const scope = await requireTvAdmin(request, true);
    const parsed = z.object({ accountId: z.string().regex(/^\d{5,30}$/) }).strict().safeParse(await readTvJson(request));
    if (!parsed.success) throw new TvError("Selecione a conta da loja.");
    const pending = await pendingInstagramAuthorization(scope);
    if (!pending?.encryptedToken || !instagramAccounts(pending.accounts).some(account => account.id === parsed.data.accountId)) throw new TvError("A autorização expirou. Conecte o Instagram novamente.", 410);
    const connection = await connectTvInstagramAccount({ accessToken: decryptTvToken(pending.encryptedToken, scope.establishmentId), accountId: parsed.data.accountId, accessMode: "unified" });
    const now = new Date();
    await db.$transaction(async tx => {
      const consumed = await tx.tvInstagramAuthorization.deleteMany({ where: { id: pending.id, stateHash: pending.stateHash, expiresAt: { gt: now }, encryptedToken: pending.encryptedToken } });
      if (!consumed.count) throw new TvError("Essa autorização já foi utilizada ou cancelada. Conecte novamente.", 409);
      const previous = await tx.tvConfig.findUnique({ where: { establishmentId: scope.establishmentId } });
      const data = { instagramAccountId: connection.accountId, instagramUsername: connection.username, instagramAccessMode: "unified", instagramEncryptedToken: pending.encryptedToken, instagramTokenExpiresAt: pending.tokenExpiresAt, instagramClientBusinessId: pending.clientBusinessId, instagramSystemUserId: pending.systemUserId, instagramConfigId: pending.configId, instagramReconnectRequired: false, instagramTokenRefreshAttemptAt: null, instagramConnectedAt: now, instagramLastAttemptAt: now, instagramSyncedAt: now, instagramRefreshLeaseUntil: null, instagramLastError: null, instagramStories: tvStoriesJson(connection.stories) };
      await tx.tvConfig.upsert({ where: { establishmentId: scope.establishmentId }, create: { establishmentId: scope.establishmentId, ...data }, update: data });
      if (previous?.instagramAccountId !== connection.accountId) await tx.tvStoryPreference.deleteMany({ where: { establishmentId: scope.establishmentId } });
      await tx.auditEvent.create({ data: tvAuditData(scope, request, "UPDATE", "TvInstagramConnection", scope.establishmentId, { connected: true, username: connection.username, accountId: connection.accountId, authorization: "oauth" }) });
    });
    return tvJson({ connected: true, username: connection.username });
  } catch (error) { return tvFailure(error); }
}
