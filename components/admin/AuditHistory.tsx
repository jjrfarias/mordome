"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FileClock, Search, ShieldCheck, X } from "lucide-react";

type AuditEvent = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  actorName: string;
  actorUsername: string;
  establishmentName?: string | null;
};

const actionLabels: Record<string, string> = {
  CREATE: "Cadastro criado", UPDATE: "Cadastro alterado", DELETE: "Cadastro excluído", LOGIN: "Login realizado", LOGOUT: "Sessão encerrada",
  ESTABLISHMENT_SWITCH: "Unidade alterada", PERMISSION_CHANGE: "Permissão alterada", CASH_OPEN: "Caixa aberto", CASH_CLOSE: "Caixa fechado",
  CASH_MOVEMENT: "Movimento de caixa", SALE_COMPLETE: "Venda finalizada", SALE_CANCEL: "Venda cancelada", TAB_ITEM_CANCEL: "Item enviado cancelado", DISCOUNT_APPLY: "Desconto aplicado",
  STOCK_ENTRY: "Entrada de estoque", STOCK_CONFIGURE: "Estoque configurado", STOCK_TRANSFER: "Estoque transferido", TAB_OPEN: "Comanda aberta",
  TAB_ITEM_CHANGE: "Comanda alterada", ORDER_SENT: "Pedido enviado", ORDER_STATUS_CHANGE: "Etapa do pedido alterada",
  TAB_CLOSE: "Comanda fechada",
  PRINT_REPRINT: "Reimpressão solicitada",
};

const entityLabels: Record<string, string> = { Session: "Sessão", Establishment: "Estabelecimento", Product: "Produto", ProductOffering: "Oferta", Recipe: "Ficha técnica", InventoryItem: "Item de estoque", StockMovement: "Movimento de estoque", CashSession: "Caixa", CashMovement: "Movimento de caixa", Sale: "Venda", Tab: "Comanda", Order: "Pedido", Organization: "Organização" };

function JsonDetails({ title, value }: { title: string; value: unknown }) {
  if (value === undefined || value === null) return null;
  return <section><span>{title}</span><pre>{JSON.stringify(value, null, 2)}</pre></section>;
}

export function AuditHistory({ establishments }: { establishments: { id: string; name: string }[] }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [action, setAction] = useState("");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "30" });
      if (establishmentId) params.set("establishmentId", establishmentId);
      if (action) params.set("action", action);
      if (appliedQuery) params.set("query", appliedQuery);
      const response = await fetch(`/api/admin/audit?${params}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o histórico.");
      setEvents(data.events ?? []);
      setActions(data.actions ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o histórico.");
    } finally {
      setLoading(false);
    }
  }, [action, appliedQuery, establishmentId, page]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  return <div className="page-content audit-page">
    <div className="hero-row"><div><span className="section-kicker">Rastreabilidade</span><h2>Histórico do sistema</h2><p>Cada ação registrada, com responsável, unidade, momento e detalhes da alteração.</p></div><div className="audit-count"><ShieldCheck/><span><b>{total}</b> eventos encontrados</span></div></div>
    <section className="panel audit-filters">
      <form onSubmit={event => { event.preventDefault(); setPage(1); setAppliedQuery(query.trim()); }}><label className="audit-search"><Search/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar pessoa, venda, produto ou motivo" /></label><select value={establishmentId} onChange={event => { setPage(1); setEstablishmentId(event.target.value); }}><option value="">Todas as unidades</option>{establishments.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select><select value={action} onChange={event => { setPage(1); setAction(event.target.value); }}><option value="">Todas as ações</option>{actions.map(item => <option value={item} key={item}>{actionLabels[item] ?? item}</option>)}</select><button className="primary">Filtrar</button></form>
    </section>
    {error && <div className="auth-error">{error}</div>}
    <section className="panel audit-list">
      {loading ? <div className="empty"><span>Carregando histórico…</span></div> : events.length === 0 ? <div className="big-empty"><FileClock/><h2>Nenhum evento encontrado</h2><p>Altere os filtros ou realize uma nova operação.</p></div> : events.map(event => <button key={event.id} onClick={() => setSelected(event)} className="audit-row"><span className={`audit-mark audit-${event.action.toLowerCase()}`}><FileClock/></span><div className="audit-main"><b>{actionLabels[event.action] ?? event.action}</b><span>{event.reason ?? entityLabels[event.entityType] ?? event.entityType}</span></div><div className="audit-actor"><b>{event.actorName}</b><span>@{event.actorUsername}</span></div><div className="audit-place"><b>{event.establishmentName ?? "Toda a organização"}</b><span>{new Date(event.createdAt).toLocaleDateString("pt-BR")} · {new Date(event.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span></div></button>)}
      <footer className="audit-pagination"><span>Página {page} de {pages}</span><div><button disabled={page <= 1 || loading} onClick={() => setPage(current => current - 1)}><ChevronLeft/>Anterior</button><button disabled={page >= pages || loading} onClick={() => setPage(current => current + 1)}>Próxima<ChevronRight/></button></div></footer>
    </section>
    {selected && <div className="audit-drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}><aside className="audit-drawer"><button className="audit-drawer-close" onClick={() => setSelected(null)} aria-label="Fechar detalhes"><X/></button><span className="section-kicker">Detalhes do evento</span><h2>{actionLabels[selected.action] ?? selected.action}</h2><div className="audit-detail-meta"><div><span>Responsável</span><b>{selected.actorName} · @{selected.actorUsername}</b></div><div><span>Unidade</span><b>{selected.establishmentName ?? "Toda a organização"}</b></div><div><span>Data e hora</span><b>{new Date(selected.createdAt).toLocaleString("pt-BR")}</b></div><div><span>Registro</span><b>{entityLabels[selected.entityType] ?? selected.entityType} · {selected.entityId}</b></div>{selected.ipAddress && <div><span>Endereço de rede</span><b>{selected.ipAddress}</b></div>}</div>{selected.reason && <div className="audit-reason"><span>Motivo ou contexto</span><p>{selected.reason}</p></div>}<JsonDetails title="Antes" value={selected.before}/><JsonDetails title="Depois" value={selected.after}/></aside></div>}
  </div>;
}
