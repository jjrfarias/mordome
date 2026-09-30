"use client";

import { useState } from "react";
import { Heart, Leaf, Minus, Plus } from "lucide-react";
import { MAX_LINE_QUANTITY, priceSelection, type OptionSelection, type PricedSelection } from "@/lib/storefront/cart";
import { isOnPromotion } from "@/lib/storefront/catalog";
import { formatCents, type StorefrontProduct } from "@/lib/storefront/model";
import { Dialog, Rating, SafeImage, cx } from "./primitives";
import styles from "./storefront.module.css";

export function ProductDetails({ product, categoryName, favorite, onToggleFavorite, onClose, onConfirm }: { product: StorefrontProduct | null; categoryName: string; favorite: boolean; onToggleFavorite: () => void; onClose: () => void; onConfirm: (priced: Extract<PricedSelection, { ok: true }>, quantity: number) => void }) {
  return <Dialog open={product !== null} onClose={onClose} title={product?.name ?? ""} description={categoryName} size="md">
    {product && <ProductDetailsBody key={product.id} product={product} favorite={favorite} onToggleFavorite={onToggleFavorite} onConfirm={onConfirm} />}
  </Dialog>;
}

// Grupos com uma única opção obrigatória não são uma escolha real: já nascem selecionados.
const initialSelections = (product: StorefrontProduct) => Object.fromEntries(product.optionGroups.filter(group => group.minSelections > 0 && group.options.length === 1).map(group => [group.id, [group.options[0].id]]));

function ProductDetailsBody({ product, favorite, onToggleFavorite, onConfirm }: { product: StorefrontProduct; favorite: boolean; onToggleFavorite: () => void; onConfirm: (priced: Extract<PricedSelection, { ok: true }>, quantity: number) => void }) {
  const [choices, setChoices] = useState<Record<string, string[]>>(() => initialSelections(product));
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const selections: OptionSelection[] = Object.entries(choices).map(([groupId, optionIds]) => ({ groupId, optionIds }));
  const preview = priceSelection(product, selections);
  const unitPrice = product.priceCents + product.optionGroups.reduce((sum, group) => sum + (choices[group.id] ?? []).reduce((groupSum, optionId) => groupSum + (group.options.find(option => option.id === optionId)?.priceDeltaCents ?? 0), 0), 0);

  const toggle = (groupId: string, optionId: string, single: boolean, max: number) => {
    setError("");
    setChoices(current => {
      const chosen = current[groupId] ?? [];
      if (single) return { ...current, [groupId]: chosen.includes(optionId) ? [] : [optionId] };
      if (chosen.includes(optionId)) return { ...current, [groupId]: chosen.filter(id => id !== optionId) };
      return chosen.length >= max ? current : { ...current, [groupId]: [...chosen, optionId] };
    });
  };

  const confirm = () => {
    if (!preview.ok) { setError(preview.error); return; }
    onConfirm(preview, quantity);
  };

  return <div className={styles.details}>
    <div className={styles.detailsMedia}>
      <SafeImage src={product.imageUrl} alt={product.name} className={styles.detailsImage} eager />
      <button type="button" className={cx(styles.favoriteButton, favorite && styles.favoriteActive)} onClick={onToggleFavorite} aria-pressed={favorite} aria-label={favorite ? "Remover dos favoritos" : "Favoritar"}><Heart aria-hidden /></button>
    </div>
    {product.description && <p className={styles.detailsDescription}>{product.description}</p>}
    <div className={styles.detailsMeta}>
      {product.rating && <Rating average={product.rating.average} count={product.rating.count} />}
      {product.vegetarian && <span className={styles.tag}><Leaf aria-hidden />Vegetariano</span>}
      <span className={styles.price}>
        {isOnPromotion(product) && <s><span className={styles.visuallyHidden}>De </span>{formatCents(product.compareAtPriceCents!)}</s>}
        <strong className={cx(isOnPromotion(product) && styles.pricePromo)}>{formatCents(product.priceCents)}</strong>
      </span>
    </div>

    {product.optionGroups.map(group => {
      const single = group.maxSelections === 1;
      const chosen = choices[group.id] ?? [];
      return <fieldset key={group.id} className={styles.optionGroup}>
        <legend>
          <span>{group.name}</span>
          <small className={cx(group.minSelections > 0 && styles.requiredTag)}>{group.minSelections > 0 ? (single ? "Obrigatório" : `Obrigatório · ${group.minSelections} a ${group.maxSelections}`) : (single ? "Opcional" : `Opcional · até ${group.maxSelections}`)}</small>
        </legend>
        {group.options.map(option => {
          const checked = chosen.includes(option.id);
          const blocked = !single && !checked && chosen.length >= group.maxSelections;
          return <label key={option.id} className={cx(styles.optionRow, checked && styles.optionRowChecked, blocked && styles.optionRowBlocked)}>
            <input type={single ? "radio" : "checkbox"} name={`opcao-${group.id}`} checked={checked} disabled={blocked}
              onChange={() => toggle(group.id, option.id, single, group.maxSelections)}
              onClick={event => { if (single && checked && group.minSelections === 0) { event.preventDefault(); toggle(group.id, option.id, true, 1); } }} />
            <span>{option.name}</span>
            {option.priceDeltaCents > 0 && <small>+ {formatCents(option.priceDeltaCents)}</small>}
          </label>;
        })}
      </fieldset>;
    })}

    {error && <p className={styles.formError} role="alert">{error}</p>}

    <div className={styles.detailsActions}>
      <div className={styles.stepper} role="group" aria-label="Quantidade">
        <button type="button" onClick={() => setQuantity(value => Math.max(1, value - 1))} disabled={quantity <= 1} aria-label="Diminuir quantidade"><Minus aria-hidden /></button>
        <span className={styles.stepperValue} aria-live="polite">{quantity}</span>
        <button type="button" onClick={() => setQuantity(value => Math.min(MAX_LINE_QUANTITY, value + 1))} disabled={quantity >= MAX_LINE_QUANTITY} aria-label="Aumentar quantidade"><Plus aria-hidden /></button>
      </div>
      <button type="button" className={cx(styles.primaryButton, styles.grow)} onClick={confirm}>
        Adicionar · {formatCents(unitPrice * quantity)}
      </button>
    </div>
  </div>;
}
