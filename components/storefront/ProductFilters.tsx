"use client";

import { SlidersHorizontal } from "lucide-react";
import type { CatalogFilters, SortKey } from "@/lib/storefront/catalog";
import { formatCents } from "@/lib/storefront/model";
import { Dialog, cx } from "./primitives";
import styles from "./storefront.module.css";

type Quick = { popular: boolean; rating: boolean; promotions: boolean; vegetarian: boolean };

export function ProductFilters({ filters, quick, onChange, onOpenAdvanced, advancedCount }: { filters: CatalogFilters; quick: Quick; onChange: (patch: Partial<CatalogFilters>) => void; onOpenAdvanced: () => void; advancedCount: number }) {
  const chip = (label: string, pressed: boolean, toggle: () => void) => <button type="button" className={cx(styles.chip, pressed && styles.chipActive)} aria-pressed={pressed} onClick={toggle}>{label}</button>;
  const toggleSort = (sort: SortKey) => onChange({ sort: filters.sort === sort ? "featured" : sort });
  return <div className={styles.filters} role="group" aria-label="Ordenar e filtrar produtos">
    {quick.popular && chip("Mais pedidos", filters.sort === "popular", () => toggleSort("popular"))}
    {quick.rating && chip("Melhor avaliados", filters.sort === "rating", () => toggleSort("rating"))}
    {quick.promotions && chip("Promoções", filters.promotionsOnly, () => onChange({ promotionsOnly: !filters.promotionsOnly }))}
    {quick.vegetarian && chip("Vegetariano", filters.vegetarianOnly, () => onChange({ vegetarianOnly: !filters.vegetarianOnly }))}
    <button type="button" className={cx(styles.chip, styles.chipFilter, advancedCount > 0 && styles.chipOutlineActive)} onClick={onOpenAdvanced} aria-haspopup="dialog">
      <SlidersHorizontal aria-hidden />Filtrar{advancedCount > 0 && <span className={styles.chipCount}>{advancedCount}<span className={styles.visuallyHidden}> filtros ativos</span></span>}
    </button>
  </div>;
}

const priceCaps = [2000, 3000, 5000];

export function FilterDialog({ open, onClose, filters, quick, onChange, onReset, resultCount, hasFavorites }: { open: boolean; onClose: () => void; filters: CatalogFilters; quick: Quick; onChange: (patch: Partial<CatalogFilters>) => void; onReset: () => void; resultCount: number; hasFavorites: boolean }) {
  const sorts: { key: SortKey; label: string; show: boolean }[] = [
    { key: "featured", label: "Ordem do cardápio", show: true },
    { key: "popular", label: "Mais pedidos", show: quick.popular },
    { key: "rating", label: "Melhor avaliados", show: quick.rating },
    { key: "price-asc", label: "Menor preço", show: true },
    { key: "price-desc", label: "Maior preço", show: true },
    { key: "name", label: "Nome (A–Z)", show: true },
  ];
  return <Dialog open={open} onClose={onClose} title="Filtrar e ordenar" size="sm" footer={<>
    <button type="button" className={styles.ghostButton} onClick={onReset}>Limpar filtros</button>
    <button type="button" className={styles.primaryButton} onClick={onClose}>Ver {resultCount} {resultCount === 1 ? "produto" : "produtos"}</button>
  </>}>
    <fieldset className={styles.fieldset}>
      <legend>Ordenar por</legend>
      {sorts.filter(sort => sort.show).map(sort => <label key={sort.key} className={styles.choice}>
        <input type="radio" name="ordenacao" checked={filters.sort === sort.key} onChange={() => onChange({ sort: sort.key })} />{sort.label}
      </label>)}
    </fieldset>
    <fieldset className={styles.fieldset}>
      <legend>Mostrar somente</legend>
      {quick.promotions && <label className={styles.choice}><input type="checkbox" checked={filters.promotionsOnly} onChange={event => onChange({ promotionsOnly: event.target.checked })} />Promoções</label>}
      {quick.vegetarian && <label className={styles.choice}><input type="checkbox" checked={filters.vegetarianOnly} onChange={event => onChange({ vegetarianOnly: event.target.checked })} />Vegetarianos</label>}
      <label className={styles.choice}><input type="checkbox" checked={filters.favoritesOnly} disabled={!hasFavorites && !filters.favoritesOnly} onChange={event => onChange({ favoritesOnly: event.target.checked })} />Meus favoritos{!hasFavorites && <small> (toque no coração de um produto)</small>}</label>
    </fieldset>
    <fieldset className={styles.fieldset}>
      <legend>Preço máximo</legend>
      <label className={styles.choice}><input type="radio" name="preco" checked={filters.maxPriceCents === null} onChange={() => onChange({ maxPriceCents: null })} />Qualquer preço</label>
      {priceCaps.map(cap => <label key={cap} className={styles.choice}><input type="radio" name="preco" checked={filters.maxPriceCents === cap} onChange={() => onChange({ maxPriceCents: cap })} />Até {formatCents(cap)}</label>)}
    </fieldset>
  </Dialog>;
}
