import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { readTvJson, requireTvAdmin, tvAuditData, tvDisplayTokenHash, tvFailure, tvJson, TvError } from "@/lib/tv-server";

export const dynamic = "force-dynamic";
const schema = z.object({ code: z.string().regex(/^[A-F0-9]{10}$/), name: z.string().trim().min(1).max(80) }).strict();

export async function POST(request: Request) {
  try {
    const scope = await requireTvAdmin(request, true);
    if (!rateLimit(`tv-pair-approve:${scope.actorId}`, 20, 600_000).allowed) throw new TvError("Muitas tentativas. Aguarde alguns minutos.", 429);
    const parsed = schema.safeParse(await readTvJson(request));
    if (!parsed.success) throw new TvError("Confira o código da TV e preencha o nome.");
    const display = await db.$transaction(async tx => {
      const pairing = await tx.tvPairing.findUnique({ where: { codeHash: tvDisplayTokenHash(parsed.data.code) } });
      if (!pairing || pairing.displayId || pairing.expiresAt <= new Date()) throw new TvError("Código expirado ou já utilizado. Gere outro na TV.", 410);
      // Claim once inside the transaction. Concurrent approvals cannot create two screens.
      const claimed = await tx.tvPairing.updateMany({ where: { id: pairing.id, displayId: null, expiresAt: { gt: new Date() } }, data: { displayId: "claiming" } });
      if (!claimed.count) throw new TvError("Este código já foi utilizado.", 409);
      const created = await tx.tvDisplay.create({ data: { establishmentId: scope.establishmentId, name: parsed.data.name, tokenHash: pairing.deviceHash }, select: { id: true, name: true } });
      await tx.tvPairing.update({ where: { id: pairing.id }, data: { displayId: created.id } });
      await tx.auditEvent.create({ data: tvAuditData(scope, request, "CREATE", "TvDisplay", created.id, { name: created.name, activation: "pairing" }) });
      return created;
    });
    return tvJson({ name: display.name }, 201);
  } catch (error) { return tvFailure(error); }
}
