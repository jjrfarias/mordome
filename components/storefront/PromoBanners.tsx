"use client";

import { ArrowRight, Crown, Headset, ShieldCheck, Truck, Utensils, type LucideIcon } from "lucide-react";
import type { BenefitIcon, StorefrontData } from "@/lib/storefront/model";
import { Dialog, SafeImage, cx } from "./primitives";
import styles from "./storefront.module.css";

export function PromoBanners({ combo, loyalty, onCombo, onLoyalty }: { combo: StorefrontData["comboPromo"]; loyalty: StorefrontData["loyalty"]; onCombo: () => void; onLoyalty: () => void }) {
  if (!combo && !loyalty) return null;
  return <div className={cx(styles.promos, (!combo || !loyalty) && styles.promosSingle)}>
    {combo && <section className={styles.comboBanner} aria-labelledby="promo-combos">
      <SafeImage src={combo.imageUrl} alt="" className={styles.comboImage} />
      <div className={styles.comboShade} aria-hidden />
      <div className={styles.comboCopy}>
        <h2 id="promo-combos">{combo.title}</h2>
        <p>{combo.text}</p>
        <button type="button" className={styles.warmButton} onClick={onCombo}>{combo.ctaLabel}<ArrowRight aria-hidden /></button>
      </div>
    </section>}
    {loyalty && <section id="fidelidade" className={styles.loyalty} aria-labelledby="promo-fidelidade">
      <Crown aria-hidden className={styles.loyaltyIcon} />
      <div>
        <h2 id="promo-fidelidade">{loyalty.title}</h2>
        <p>{loyalty.text}</p>
        <button type="button" className={styles.warmButton} onClick={onLoyalty}>{loyalty.ctaLabel}<ArrowRight aria-hidden /></button>
      </div>
    </section>}
  </div>;
}

export function LoyaltyDialog({ open, loyalty, isDemo, onClose }: { open: boolean; loyalty: StorefrontData["loyalty"]; isDemo: boolean; onClose: () => void }) {
  if (!loyalty) return null;
  return <Dialog open={open} onClose={onClose} title={loyalty.title} size="sm" footer={<button type="button" className={styles.primaryButton} onClick={onClose}>Entendi</button>}>
    <ul className={styles.checkList}>{loyalty.details.map(detail => <li key={detail}>{detail}</li>)}</ul>
    {isDemo && <p className={styles.demoNote}>Programa demonstrativo: nenhuma adesão é registrada. Na operação real, este bloco só aparece quando o estabelecimento tiver um programa de fidelidade integrado.</p>}
  </Dialog>;
}

const benefitIcons: Record<BenefitIcon, LucideIcon> = { food: Utensils, delivery: Truck, payment: ShieldCheck, support: Headset };

export function Benefits({ benefits, className }: { benefits: StorefrontData["benefits"]; className?: string }) {
  if (benefits.length === 0) return null;
  return <ul className={cx(styles.benefits, className)} aria-label="Por que pedir aqui">
    {benefits.map(benefit => {
      const Icon = benefitIcons[benefit.icon];
      return <li key={benefit.title}><span className={styles.benefitIcon} aria-hidden><Icon /></span><span><b>{benefit.title}</b><small>{benefit.text}</small></span></li>;
    })}
  </ul>;
}
