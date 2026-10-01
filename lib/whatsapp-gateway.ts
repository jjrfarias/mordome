import { DisconnectReason, fetchLatestBaileysVersion, initAuthCreds, makeWASocket, type AuthenticationCreds, type AuthenticationState, type SignalDataSet, type SignalDataTypeMap, type WASocket } from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { decryptWhatsAppSession, encryptWhatsAppSession } from "@/lib/whatsapp-session";

type Status = "DISCONNECTED" | "CONNECTING" | "QR" | "READY";
type Archive = { creds: AuthenticationCreds; keys: Record<string, unknown> };
type Connection = { socket: WASocket; status: Status; qr?: string; reconnect?: ReturnType<typeof setTimeout> };
type GlobalConnections = { clients: Map<string, Connection> };
const globalConnections = globalThis as unknown as { mordomeWhatsApp?: GlobalConnections };
const connections = globalConnections.mordomeWhatsApp ?? { clients: new Map<string, Connection>() };
if (process.env.NODE_ENV !== "production") globalConnections.mordomeWhatsApp = connections;
const logger = pino({ level: "silent" });

export const customerLoginConfigured = () => Boolean((process.env.CUSTOMER_AUTH_SECRET?.length ?? 0) >= 32);


async function authState(unit: string): Promise<{ state: AuthenticationState; save: () => Promise<void> }> {
  const row = await db.whatsAppConnection.findUnique({ where: { establishmentId: unit }, select: { credentialsCiphertext: true } });
  const archive: Archive = row?.credentialsCiphertext ? decryptWhatsAppSession<Archive>(unit, row.credentialsCiphertext) : { creds: initAuthCreds(), keys: {} };
  let writing = Promise.resolve();
  const save = () => {
    writing = writing.catch(() => {}).then(async () => {
      await db.whatsAppConnection.update({ where: { establishmentId: unit }, data: { credentialsCiphertext: encryptWhatsAppSession(unit, archive) } });
    });
    return writing;
  };
  return { state: {
    creds: archive.creds,
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
        const result: { [id: string]: SignalDataTypeMap[T] } = {};
        for (const id of ids) {
          const value = archive.keys[`${type}:${id}`];
          if (value !== undefined) result[id] = value as SignalDataTypeMap[T];
        }
        return result;
      },
      set: async (data: SignalDataSet) => {
        for (const type of Object.keys(data) as (keyof SignalDataSet)[]) {
          const values = data[type]; if (!values) continue;
          for (const id of Object.keys(values)) {
            const value = values[id]; const key = `${type}:${id}`;
            if (value === undefined || value === null) delete archive.keys[key]; else archive.keys[key] = value;
          }
        }
        await save();
      },
    },
  }, save };
}

async function start(unit: string) {
  const existing = connections.clients.get(unit);
  if (existing) return existing;
  await db.whatsAppConnection.upsert({ where: { establishmentId: unit }, create: { establishmentId: unit, enabled: true }, update: { enabled: true } });
  const { state, save } = await authState(unit);
  const { version } = await fetchLatestBaileysVersion();
  const socket = makeWASocket({ auth: state, logger, printQRInTerminal: false, version, syncFullHistory: false, markOnlineOnConnect: false });
  const connection: Connection = { socket, status: "CONNECTING" };
  connections.clients.set(unit, connection);
  socket.ev.on("creds.update", () => { void save().catch(() => {}); });
  socket.ev.on("connection.update", update => { void (async () => {
    if (update.qr) { connection.status = "QR"; connection.qr = await QRCode.toDataURL(update.qr); }
    if (update.connection === "open") { connection.status = "READY"; connection.qr = undefined; }
    if (update.connection !== "close") return;
    connections.clients.delete(unit);
    const code = (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
    if (code === DisconnectReason.loggedOut) {
      await db.whatsAppConnection.update({ where: { establishmentId: unit }, data: { enabled: false, credentialsCiphertext: null } });
      return;
    }
    await db.whatsAppConnection.update({ where: { establishmentId: unit }, data: { updatedAt: new Date() } });
    connection.reconnect = setTimeout(() => { void resume(unit); }, 3000);
  })().catch(() => {}); });
  return connection;
}

async function resume(unit: string) {
  const row = await db.whatsAppConnection.findUnique({ where: { establishmentId: unit }, select: { enabled: true } });
  if (row?.enabled && !connections.clients.has(unit)) await start(unit);
}

function whatsappRecipient(value: string) {
  const digits = value.replace(/\D/g, "");
  const national = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  return /^[1-9]{2}9?\d{8}$/.test(national) ? `55${national}` : null;
}

export async function sendWhatsAppMessage(unit: string, phone: string, text: string) {
  const connection = connections.clients.get(unit);
  const recipientPhone = whatsappRecipient(phone);
  if (connection?.status !== "READY" || !recipientPhone || !text.trim() || text.length > 600) throw Error("WHATSAPP_UNAVAILABLE");
  const registered = await connection.socket.onWhatsApp(recipientPhone);
  const recipient = registered?.find(entry => entry.exists)?.jid;
  if (!recipient) throw Error("WHATSAPP_RECIPIENT_UNAVAILABLE");
  await connection.socket.sendMessage(recipient, { text: text.trim() });
}

export async function whatsappGateway(unit: string, action: "status" | "resume" | "connect" | "disconnect" | "send-code", payload: Record<string, string> = {}) {
  if (!customerLoginConfigured()) throw Error("WHATSAPP_UNAVAILABLE");
  if (action === "disconnect") {
    const connection = connections.clients.get(unit);
    if (connection?.reconnect) clearTimeout(connection.reconnect);
    connections.clients.delete(unit);
    await db.whatsAppConnection.upsert({ where: { establishmentId: unit }, create: { establishmentId: unit, enabled: false }, update: { enabled: false, credentialsCiphertext: null } });
    if (connection) await connection.socket.logout().catch(() => connection.socket.end(undefined));
    return { status: "DISCONNECTED" as const };
  }
  if (action === "connect") await start(unit);
  if (action === "resume") await resume(unit);
  const connection = connections.clients.get(unit);
  if (action !== "send-code") return { status: connection?.status ?? "DISCONNECTED", qr: connection?.status === "QR" ? connection.qr : undefined };
  if (connection?.status !== "READY" || !/^55[1-9]{2}9\d{8}$/.test(payload.phone ?? "") || !/^\d{6}$/.test(payload.code ?? "")) throw Error("WHATSAPP_UNAVAILABLE");
  await sendWhatsAppMessage(unit, payload.phone, `Seu código de acesso ao Mordomê é ${payload.code}. Validade: 5 minutos. Não compartilhe. Se não solicitou, ignore.`);
  return { status: "READY" as const };
}
