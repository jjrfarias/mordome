import { db } from "../lib/db";
import { hashPassword } from "../lib/password";
import { usernameSchema, passwordSchema } from "../lib/auth-validation";

const name = process.env.SYSTEM_ADMIN_NAME?.trim();
const usernameResult = usernameSchema.safeParse(process.env.SYSTEM_ADMIN_USERNAME);
const passwordResult = passwordSchema.safeParse(process.env.SYSTEM_ADMIN_PASSWORD);
if (!name || name.length < 2 || !usernameResult.success || !passwordResult.success) {
  throw new Error("Defina SYSTEM_ADMIN_NAME, SYSTEM_ADMIN_USERNAME e SYSTEM_ADMIN_PASSWORD válidos no ambiente do comando.");
}
const username = usernameResult.data.trim().toLowerCase();
const passwordHash = await hashPassword(passwordResult.data);
await db.systemAdmin.upsert({
  where: { username },
  update: { name, passwordHash, active: true, sessions: { deleteMany: {} } },
  create: { name, username, passwordHash },
});
console.log(`Administrador do sistema '${username}' criado ou atualizado; sessões anteriores foram encerradas.`);
await db.$disconnect();
