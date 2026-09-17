"use client";

import { useEffect, useState } from "react";
import { Plus, Search, User, X } from "lucide-react";
import { money } from "@/lib/domain";

type Customer = { id: string; name: string; phone: string; email: string | null; document: string | null; notes: string | null; active: boolean; createdAt: string; ordersCount: number; totalSpent: number; lastAddress: string | null };
type CustomerForm = { name: string; phone: string; email: string; document: string; notes: string };
const emptyForm: CustomerForm = { name: "", phone: "", email: "", document: "", notes: "" };

// Cadastro de clientes (ADR 0047): telefone é reconhecido automaticamente ao criar um pedido de
// delivery (ver DeliveryManagement.tsx) — esta tela é para cadastro manual/consulta/edição, não é
// o único jeito de um cliente entrar no sistema.
export function CustomersManagement() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; customer: Customer } | null>(null);

  const load = async (term: string) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/customers${term ? `?search=${encodeURIComponent(term)}` : ""}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar os clientes.");
      setCustomers(data.customers ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar os clientes."); } finally { setLoading(false); }
  };
  useEffect(() => { const timeout = setTimeout(() => { void load(search); }, 300); return () => clearTimeout(timeout); }, [search]);

  const toggleActive = async (customer: Customer) => {
    setError("");
    try {
      const response = await fetch("/api/admin/customers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: customer.id, active: !customer.active }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o cliente.");
      await load(search);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o cliente."); }
  };

  return <section className="page-content">
    <section className="panel settings-shell">
      <div className="settings-shell-header">
        <div><span className="section-kicker">Relacionamento com cliente</span><h2>Clientes</h2></div>
        <button type="button" className="primary" onClick={() => setModal({ mode: "create" })}><Plus />Novo cliente</button>
      </div>
      <p className="section-note">Reconhecido automaticamente pelo telefone ao criar um pedido de delivery — cadastre aqui só quando quiser adiantar ou completar os dados.</p>
      <div className="search" style={{ maxWidth: 360 }}><Search /><input placeholder="Buscar por nome ou telefone…" value={search} onChange={event => setSearch(event.target.value)} /></div>
    </section>

    {error && <div className="auth-error">{error}</div>}
    {loading ? <div className="empty"><span>Carregando clientes…</span></div> : customers.length === 0 ? <section className="panel settings-shell"><div className="empty"><User /><span>Nenhum cliente encontrado.</span></div></section> : <section className="panel settings-table-wrap">
      <div className="settings-table-head">
        <span>Cliente</span>
        <span>Telefone</span>
        <span>Pedidos</span>
        <span>Ações</span>
      </div>
      <div className="settings-table-body">
        {customers.map(customer => <article className="settings-row" key={customer.id}>
          <div className="settings-cell">
            <strong>{customer.name}</strong>
            {customer.email && <small>{customer.email}</small>}
          </div>
          <div className="settings-cell">{customer.phone}</div>
          <div className="settings-cell">
            <strong>{customer.ordersCount}</strong>
            <small>{money(customer.totalSpent)} em compras</small>
          </div>
          <div className="settings-cell">
            <div className="settings-actions">
              <span className={`status-pill ${customer.active ? "status-active" : "status-inactive"}`}>{customer.active ? "Ativo" : "Inativo"}</span>
              <button type="button" className="secondary" onClick={() => setModal({ mode: "edit", customer })}>Editar</button>
              <button type="button" className={`secondary ${customer.active ? "warn" : ""}`} onClick={() => void toggleActive(customer)}>{customer.active ? "Inativar" : "Ativar"}</button>
            </div>
          </div>
        </article>)}
      </div>
    </section>}

    {modal && <CustomerModal initial={modal.mode === "edit" ? modal.customer : null} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(search); }} />}
  </section>;
}

function CustomerModal({ initial, onClose, onSaved }: { initial: Customer | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<CustomerForm>(initial ? { name: initial.name, phone: initial.phone, email: initial.email ?? "", document: initial.document ?? "", notes: initial.notes ?? "" } : emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const valid = form.name.trim().length >= 2 && form.phone.replace(/\D/g, "").length >= 8;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true); setError("");
    try {
      const payload = { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() || undefined, document: form.document.trim() || undefined, notes: form.notes.trim() || undefined };
      const response = await fetch("/api/admin/customers", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(initial ? { customerId: initial.id, ...payload } : payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar o cliente.");
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o cliente."); } finally { setSaving(false); }
  };

  return <div className="modal-bg"><div className="modal">
    <button className="modal-close" onClick={onClose}><X /></button>
    <span className="modal-icon"><User /></span>
    <h2>{initial ? "Editar cliente" : "Novo cliente"}</h2>
    {error && <div className="auth-error">{error}</div>}
    <label className="field"><span>Nome</span><input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Nome do cliente" /></label>
    <label className="field"><span>Telefone</span><input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} placeholder="(00) 00000-0000" /></label>
    <label className="field"><span>E-mail (opcional)</span><input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
    <label className="field"><span>CPF (opcional)</span><input value={form.document} onChange={event => setForm({ ...form, document: event.target.value })} /></label>
    <label className="field"><span>Observações (opcional)</span><input value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label>
    <button className="primary wide" disabled={!valid || saving} onClick={() => void save()}>{saving ? "Salvando…" : initial ? "Salvar alterações" : "Cadastrar cliente"}</button>
  </div></div>;
}
