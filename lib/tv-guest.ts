import { db } from "@/lib/db";
import { TvError } from "@/lib/tv-model";
import { isTvStorageConfigured } from "@/lib/tv-storage";

export async function findTvGuestStore(code: string) {
  if (!/^[a-zA-Z0-9_-]{20,64}$/.test(code)) throw new TvError("Link de envio não encontrado.", 404);
  const config = await db.tvConfig.findFirst({ where: { guestCode: code, establishment: { active: true, organization: { active: true } } }, select: {
    guestUploadsEnabled: true, brandName: true, accentColor: true,
    establishment: { select: { id: true, name: true, organizationId: true, logoUrl: true, organization: { select: { brandLogoUrl: true } } } },
  } });
  if (!config) throw new TvError("Link de envio não encontrado.", 404);
  return { ...config, available: config.guestUploadsEnabled && isTvStorageConfigured() };
}
