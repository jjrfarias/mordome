"use client";

import { CakeSlice, Croissant, CupSoda, LayoutGrid, Package, Pizza, Popcorn, Salad, Sandwich, Soup, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { categoryIconKey, type CategoryIconKey } from "@/lib/storefront/catalog";
import type { StorefrontCategory } from "@/lib/storefront/model";
import { cx } from "./primitives";
import styles from "./storefront.module.css";

const icons: Record<CategoryIconKey, { icon: LucideIcon; tone: string }> = {
  pizza: { icon: Pizza, tone: styles.toneOrange },
  burger: { icon: Sandwich, tone: styles.toneAmber },
  pasta: { icon: Soup, tone: styles.toneRed },
  drink: { icon: CupSoda, tone: styles.toneRed },
  dessert: { icon: CakeSlice, tone: styles.toneBrown },
  combo: { icon: Package, tone: styles.toneOrange },
  healthy: { icon: Salad, tone: styles.toneGreen },
  pastry: { icon: Croissant, tone: styles.toneAmber },
  snack: { icon: Popcorn, tone: styles.toneAmber },
  other: { icon: UtensilsCrossed, tone: styles.toneBrown },
};

export function CategoryNavigation({ categories, selected, onSelect }: { categories: StorefrontCategory[]; selected: string | null; onSelect: (categoryId: string | null) => void }) {
  if (categories.length < 2) return null;
  const items = [{ id: null, name: "Todos", icon: LayoutGrid, tone: "" }, ...categories.map(category => ({ id: category.id, name: category.name, ...icons[categoryIconKey(category.name)] }))];
  return <nav className={styles.categories} aria-label="Categorias do cardápio">
    <ul className={styles.categoryList}>
      {items.map(item => {
        const Icon = item.icon;
        const active = selected === item.id;
        return <li key={item.id ?? "todos"}>
          <button type="button" className={cx(styles.categoryButton, active && styles.categoryActive)} aria-pressed={active} onClick={() => onSelect(item.id)}>
            <span className={cx(styles.categoryIcon, item.id === null && styles.categoryIconAll, item.tone)} aria-hidden><Icon /></span>
            <span>{item.name}</span>
          </button>
        </li>;
      })}
    </ul>
  </nav>;
}
