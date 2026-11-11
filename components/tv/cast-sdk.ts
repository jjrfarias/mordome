import { TV_CAST_NAMESPACE, type TvCastMessage } from "../../lib/tv-cast.ts";

type MessageListener = (namespace: string, message: string) => void;
export type CastSession = {
  getCastDevice(): { friendlyName: string };
  sendMessage(namespace: string, message: unknown): Promise<void>;
  addMessageListener(namespace: string, listener: MessageListener): void;
  removeMessageListener(namespace: string, listener: MessageListener): void;
};
export type CastContext = {
  setOptions(options: { receiverApplicationId: string; autoJoinPolicy: string; resumeSavedSession: boolean }): void;
  requestSession(): Promise<void>;
  getCurrentSession(): CastSession | null;
  endCurrentSession(stopCasting: boolean): void;
};
type SenderWindow = Window & {
  __onGCastApiAvailable?: (available: boolean) => void;
  cast?: { framework: { CastContext: { getInstance(): CastContext } } };
};

let loading: Promise<CastContext> | null = null;
export function loadCastSender(applicationId: string): Promise<CastContext> {
  const target = window as SenderWindow;
  const initialize = () => {
    const context = target.cast!.framework.CastContext.getInstance();
    context.setOptions({ receiverApplicationId: applicationId, autoJoinPolicy: "origin_scoped", resumeSavedSession: false });
    return context;
  };
  if (target.cast?.framework) return Promise.resolve(initialize());
  if (loading) return loading;
  loading = new Promise<CastContext>((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = setTimeout(() => fail(), 15000);
    function fail() {
      clearTimeout(timeout); loading = null; script.remove();
      reject(new Error("Não foi possível carregar a transmissão. Use o Google Chrome no computador e tente novamente."));
    }
    target.__onGCastApiAvailable = available => {
      if (!available || !target.cast?.framework) { fail(); return; }
      clearTimeout(timeout); resolve(initialize());
    };
    script.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return loading;
}

export function pairCastSession(session: CastSession, message: TvCastMessage): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      session.removeMessageListener(TV_CAST_NAMESPACE, listener);
      if (error) reject(error); else resolve();
    };
    const listener: MessageListener = (_namespace, raw) => {
      let response: { requestId?: string; type?: string };
      try { response = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return; }
      if (!response || response.requestId !== message.requestId) return;
      if (response.type === "PAIRED") finish();
      else if (response.type === "ERROR") finish(new Error("A TV não conseguiu abrir a programação. Tente transmitir novamente."));
    };
    const timeout = setTimeout(() => finish(new Error("A TV não confirmou o recebimento. Confira a conexão e tente novamente.")), 35000);
    session.addMessageListener(TV_CAST_NAMESPACE, listener);
    session.sendMessage(TV_CAST_NAMESPACE, message).catch(() => finish(new Error("Não foi possível enviar a programação para a TV.")));
  });
}
