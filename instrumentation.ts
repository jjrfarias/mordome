export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { resumeEnabledWhatsAppConnections } = await import("./lib/whatsapp-gateway");
  await resumeEnabledWhatsAppConnections();
}
