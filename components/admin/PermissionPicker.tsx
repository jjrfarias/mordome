import { useState } from "react";
import { permissionLabel, permissionModule, type PresentedPermission } from "@/lib/permission-presentation";
import styles from "./users-management.module.css";

export function PermissionPicker({ permissions, selected, onChange, disabled = false }: { permissions: PresentedPermission[]; selected: string[]; onChange: (keys: string[]) => void; disabled?: boolean }) {
  const [search, setSearch] = useState("");
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const groups = new Map<string, PresentedPermission[]>();
  for (const permission of permissions) {
    const groupName = permissionModule(permission);
    if (term && !`${groupName} ${permissionLabel(permission)}`.toLocaleLowerCase("pt-BR").includes(term)) continue;
    groups.set(groupName, [...(groups.get(groupName) ?? []), permission]);
  }
  return <div className={styles.permissionPicker}>
    <div className={styles.permissionToolbar}><label>Buscar permissão<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Ex.: caixa, descontos, relatórios" /></label><span>{permissions.filter(p => selected.includes(p.key)).length} de {permissions.length} selecionadas</span></div>
    <div className={styles.permissionGroups}>{[...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR")).map(([groupName, items]) => {
      const count = items.filter(p => selected.includes(p.key)).length;
      return <details className={styles.permissionGroup} key={`${groupName}-${Boolean(term)}`} open={term ? true : undefined}>
        <summary><span>{groupName}</span><span>{count}/{items.length}</span></summary>
        <div className={styles.permissionItems}>
          {!disabled && <button type="button" className={styles.textButton} onClick={() => onChange(count === items.length ? selected.filter(key => !items.some(p => p.key === key)) : [...new Set([...selected, ...items.map(p => p.key)])])}>{count === items.length ? "Desmarcar grupo" : "Selecionar grupo"}</button>}
          {items.map(permission => <label key={permission.key} className={styles.check}><input type="checkbox" disabled={disabled} checked={selected.includes(permission.key)} onChange={() => onChange(selected.includes(permission.key) ? selected.filter(key => key !== permission.key) : [...selected, permission.key])} /><span>{permissionLabel(permission)}</span></label>)}
        </div>
      </details>;
    })}</div>
    {!groups.size && <p className={styles.empty}>Nenhuma permissão encontrada.</p>}
  </div>;
}
