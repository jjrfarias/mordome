"use client";

import { ShoppingBag } from "lucide-react";
import { formatCents } from "@/lib/storefront/model";
import styles from "./storefront.module.css";

export function MobileCartBar({ units, totalCents, totalIsFinal, onOpen }: { units: number; totalCents: number; totalIsFinal: boolean; onOpen: () => void }) {
  if (units === 0) return null;
  return <div className={styles.mobileBar}>
    <span className={styles.mobileBarInfo}>
      <span className={styles.mobileBarIcon} aria-hidden><ShoppingBag /><b>{units}</b></span>
      <span><small>{units} {units === 1 ? "item" : "itens"}{totalIsFinal ? "" : " · sem entrega"}</small><b>{formatCents(totalCents)}</b></span>
    </span>
    <button type="button" className={styles.primaryButton} onClick={onOpen}>Ver pedido</button>
  </div>;
}
