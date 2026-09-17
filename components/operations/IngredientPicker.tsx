"use client";

// Modal de personalização de Grupos de ingrediente, compartilhado pelos três carrinhos
// (PDV, Salão e Delivery) — ver ADR 0022. A validação de mínimo/máximo aqui é só feedback
// imediato: o servidor sempre recalcula o preço final a partir de resolveIngredientSelections.

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { money, IngredientGroup, SelectedIngredientOption } from "@/lib/domain";

export type IngredientPickerProduct = { id: string; name: string; price: number; ingredientGroups?: IngredientGroup[] };

export function productHasIngredientChoices(product: IngredientPickerProduct) {
  return (product.ingredientGroups ?? []).some(group => group.active && group.options.some(option => option.active));
}

export function formatSelectedOptions(options: SelectedIngredientOption[] | null | undefined) {
  return options && options.length ? options.map(option => option.optionName).join(", ") : "";
}

export function IngredientPicker({ product, onClose, onConfirm }: { product: IngredientPickerProduct; onClose: () => void; onConfirm: (unitPrice: number, selectedOptions: SelectedIngredientOption[], optionSelections: { groupId: string; optionIds: string[] }[]) => void }) {
  const groups = (product.ingredientGroups ?? []).filter((group: IngredientGroup) => group.active && group.options.some(option => option.active));
  // Grupo com só 1 opção ativa não é de fato uma escolha (ex.: combo fixo com um único item por
  // etapa) — pré-seleciona pra não obrigar o cliente a clicar num radio sem alternativa real.
  const [choices, setChoices] = useState<Record<string, string[]>>(() => Object.fromEntries(groups.filter(group => group.options.filter(option => option.active).length === 1).map(group => [group.id, [group.options.find(option => option.active)!.id]])));
  const [error, setError] = useState("");

  const toggleOption = (group: IngredientGroup, optionId: string) => setChoices(current => {
    const chosen = current[group.id] ?? [];
    if (group.maxSelections === 1) return { ...current, [group.id]: chosen.includes(optionId) ? [] : [optionId] };
    if (chosen.includes(optionId)) return { ...current, [group.id]: chosen.filter(id => id !== optionId) };
    if (chosen.length >= group.maxSelections) return current;
    return { ...current, [group.id]: [...chosen, optionId] };
  });

  const priceDelta = groups.reduce((sum, group) => sum + (choices[group.id] ?? []).reduce((groupSum, optionId) => groupSum + (group.options.find(option => option.id === optionId)?.priceDelta ?? 0), 0), 0);
  const unitPrice = product.price + priceDelta;

  const confirm = () => {
    for (const group of groups) {
      const chosen = choices[group.id] ?? [];
      if (chosen.length < group.minSelections) { setError(`Selecione ao menos ${group.minSelections} opção(ões) em "${group.name}".`); return; }
      if (chosen.length > group.maxSelections) { setError(`Selecione no máximo ${group.maxSelections} opção(ões) em "${group.name}".`); return; }
    }
    const selectedOptions: SelectedIngredientOption[] = groups.flatMap(group => (choices[group.id] ?? []).map(optionId => { const option = group.options.find(candidate => candidate.id === optionId)!; return { groupName: group.name, optionName: option.name, priceDelta: option.priceDelta }; }));
    const optionSelections = groups.filter(group => (choices[group.id] ?? []).length > 0).map(group => ({ groupId: group.id, optionIds: choices[group.id] ?? [] }));
    onConfirm(unitPrice, selectedOptions, optionSelections);
  };

  return <div className="modal-bg"><div className="modal ingredient-picker-modal">
    <button className="modal-close" onClick={onClose}><X/></button>
    <span className="modal-icon"><Plus/></span>
    <h2>{product.name}</h2>
    <p>Personalize o pedido antes de adicionar ao carrinho.</p>
    {groups.map(group => <div className="ingredient-picker-group" key={group.id}>
      <div className="ingredient-picker-group-head"><strong>{group.name}</strong><span>{group.minSelections > 0 ? `Obrigatório · até ${group.maxSelections}` : `Opcional · até ${group.maxSelections}`}</span></div>
      <div className="ingredient-picker-options">
        {group.options.filter(option => option.active).map(option => { const selected = (choices[group.id] ?? []).includes(option.id); return <label className={`ingredient-picker-option ${selected ? "selected" : ""}`} key={option.id}>
          <input type={group.maxSelections === 1 ? "radio" : "checkbox"} name={group.id} checked={selected} onChange={() => toggleOption(group, option.id)} />
          <span className="ingredient-picker-option-name">{option.name}</span>
          {option.priceDelta > 0 && <span className="ingredient-picker-option-price">+{money(option.priceDelta)}</span>}
        </label>; })}
      </div>
    </div>)}
    {error && <p className="ingredient-picker-error">{error}</p>}
    <div className="ingredient-picker-summary"><span>Preço com escolhas</span><strong>{money(unitPrice)}</strong></div>
    <button className="primary wide" onClick={confirm}><Plus/> Adicionar ao carrinho</button>
  </div></div>;
}
