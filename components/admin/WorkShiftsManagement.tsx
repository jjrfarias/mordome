import { useEffect, useState } from "react";

// Cadastro de turnos de trabalho da equipe (escala), ver ADR 0030.
// NÃO é o turno de caixa (CashSession) — é a escala/horário de trabalho dos funcionários.
type WorkShift = { id: string; name: string; startTime: string; endTime: string; daysOfWeek: number[]; active: boolean; assignedMembershipIds: string[] };
type UserRow = { membershipId: string; name: string; username: string; userActive: boolean; establishmentIds: string[] };

const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type WorkShiftsManagementProps = {
  activeEstablishmentId: string;
  canViewUsers: boolean;
};

export function WorkShiftsManagement({ activeEstablishmentId, canViewUsers }: WorkShiftsManagementProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);

  const [name, setName] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("14:00");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyAssignment, setBusyAssignment] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const requests: Promise<Response>[] = [fetch("/api/admin/work-shifts", { cache: "no-store" })];
      if (canViewUsers) requests.push(fetch("/api/admin/users", { cache: "no-store" }));
      const responses = await Promise.all(requests);
      const shiftsData = await responses[0].json().catch(() => ({}));
      if (!responses[0].ok) throw new Error(shiftsData.error ?? "Não foi possível carregar os turnos.");
      setShifts(shiftsData.workShifts ?? []);
      if (canViewUsers && responses[1]) {
        const usersData = await responses[1].json().catch(() => ({}));
        if (responses[1].ok) setUsers((usersData.users ?? []).filter((user: UserRow) => user.establishmentIds.includes(activeEstablishmentId)));
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar os turnos."); } finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [activeEstablishmentId]);

  const toggleDay = (day: number) => setDays(current => current.includes(day) ? current.filter(item => item !== day) : [...current, day].sort((a, b) => a - b));

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim().length < 2 || days.length === 0 || creating) return;
    setCreating(true); setError("");
    try {
      const response = await fetch("/api/admin/work-shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "CREATE", name: name.trim(), startTime, endTime, daysOfWeek: days }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar o turno.");
      setName(""); setDays([1, 2, 3, 4, 5]); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar o turno."); } finally { setCreating(false); }
  };

  const toggleActive = async (shift: WorkShift) => {
    setError("");
    try {
      const response = await fetch("/api/admin/work-shifts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workShiftId: shift.id, active: !shift.active }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o turno.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o turno."); }
  };

  const toggleAssignment = async (shift: WorkShift, membershipId: string, assigned: boolean) => {
    setBusyAssignment(`${shift.id}:${membershipId}`); setError("");
    try {
      const response = await fetch("/api/admin/work-shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: assigned ? "UNASSIGN_USER" : "ASSIGN_USER", workShiftId: shift.id, membershipId }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar a atribuição.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a atribuição."); } finally { setBusyAssignment(""); }
  };

  return <section className="page-content">
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Turnos</span><h2>Novo turno</h2></div></div>
      <p className="section-note">Cadastre os turnos de trabalho da equipe (ex.: Manhã, Tarde, Noite) para organizar a escala. Isto não controla ponto nem calcula horas trabalhadas — é apenas o cadastro de horários e a atribuição de quem trabalha em cada turno.</p>
      <form onSubmit={create} className="settings-form">
        <label className="field"><span>Nome do turno</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Manhã" /></label>
        <label className="field"><span>Início</span><input type="time" value={startTime} onChange={event => setStartTime(event.target.value)} /></label>
        <label className="field"><span>Fim</span><input type="time" value={endTime} onChange={event => setEndTime(event.target.value)} /></label>
        <div className="field work-shift-days"><span>Dias da semana</span>
          <div className="chips">
            {dayLabels.map((label, index) => <button type="button" key={index} className={days.includes(index) ? "active" : ""} onClick={() => toggleDay(index)}>{label}</button>)}
          </div>
        </div>
        <button className="primary" type="submit" disabled={name.trim().length < 2 || days.length === 0 || creating}>{creating ? "Criando…" : "Criar turno"}</button>
      </form>
    </section>
    {loading ? <div className="empty"><span>Carregando turnos…</span></div> : null}
    {error && <div className="auth-error">{error}</div>}
    {!loading && shifts.length === 0 && <div className="empty small"><span>Nenhum turno cadastrado ainda nesta unidade.</span></div>}
    {!loading && shifts.length > 0 && <section className="panel settings-shell">
      <div className="role-list">
        {shifts.map(shift => <article key={shift.id} className="role-card">
          <div className="role-card-head">
            <div>
              <b>{shift.name}</b>
              <span className="status-pill status-inactive">{shift.startTime}–{shift.endTime}</span>
              <span className="status-pill status-inactive">{shift.daysOfWeek.map(day => dayLabels[day]).join(", ")}</span>
              {!shift.active && <span className="status-pill status-inactive">Inativo</span>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {canViewUsers && <button type="button" className="secondary" onClick={() => setExpanded(current => current === shift.id ? null : shift.id)}>{expanded === shift.id ? "Fechar equipe" : `Equipe (${shift.assignedMembershipIds.length})`}</button>}
              <button type="button" className={`secondary ${shift.active ? "warn" : ""}`} onClick={() => toggleActive(shift)}>{shift.active ? "Desativar" : "Ativar"}</button>
            </div>
          </div>
          {canViewUsers && expanded === shift.id && <div className="work-shift-team">
            {users.length === 0 && <p className="section-note">Nenhum usuário com acesso a esta unidade.</p>}
            {users.map(user => {
              const assigned = shift.assignedMembershipIds.includes(user.membershipId);
              const busy = busyAssignment === `${shift.id}:${user.membershipId}`;
              return <label key={user.membershipId} className="work-shift-team-row">
                <input type="checkbox" checked={assigned} disabled={busy} onChange={() => toggleAssignment(shift, user.membershipId, assigned)} />
                <span>{user.name}</span><small>@{user.username}</small>
              </label>;
            })}
          </div>}
        </article>)}
      </div>
    </section>}
  </section>;
}
