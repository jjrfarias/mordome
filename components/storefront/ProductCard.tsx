"use client";

import { Heart, Plus } from "lucide-react";
import { productBadge, isOnPromotion } from "@/lib/storefront/catalog";
import { formatCents, type StorefrontProduct } from "@/lib/storefront/model";
import { Rating, SafeImage, cx } from "./primitives";
import styles from "./storefront.module.css";

export function ProductCard({ product, favorite, onToggleFavorite, onOpen, onAdd, requiresChoice, eagerImage }: { product: StorefrontProduct; favorite: boolean; onToggleFavorite: () => void; onOpen: () => void; onAdd: () => void; requiresChoice: boolean; eagerImage?: boolean }) {
  const badge = productBadge(product);
  const promo = isOnPromotion(product);
  return <article className={styles.card}>
    <div className={styles.cardMedia}>
      <SafeImage src={product.imageUrl} alt="" className={styles.cardImage} eager={eagerImage} sizes="(min-width: 1180px) 260px, (min-width: 560px) 45vw, 40vw" />
      {badge && <span className={cx(styles.badge, badge === "Oferta" && styles.badgeOffer)}>{badge}</span>}
      <button type="button" className={cx(styles.favoriteButton, favorite && styles.favoriteActive)} onClick={onToggleFavorite} aria-pressed={favorite} aria-label={favorite ? `Remover ${product.name} dos favoritos` : `Favoritar ${product.name}`}>
        <Heart aria-hidden />
      </button>
    </div>
    <div className={styles.cardBody}>
      <h3 className={styles.cardTitle}><button type="button" className={styles.cardOpen} onClick={onOpen}>{product.name}<span className={styles.visuallyHidden}> — ver detalhes</span></button></h3>
      {product.description && <p className={styles.cardDescription}>{product.description}</p>}
      {product.rating && <Rating average={product.rating.average} count={product.rating.count} />}
      <div className={styles.cardFooter}>
        <div className={styles.price}>
          {promo && <s><span className={styles.visuallyHidden}>De </span>{formatCents(product.compareAtPriceCents!)}</s>}
          <strong className={cx(promo && styles.pricePromo)}>{promo && <span className={styles.visuallyHidden}>por </span>}{formatCents(product.priceCents)}</strong>
        </div>
        <button type="button" className={cx(styles.primaryButton, styles.addButton)} onClick={onAdd} aria-label={requiresChoice ? `Escolher opções de ${product.name}` : `Adicionar ${product.name} ao pedido`}>
          {requiresChoice ? "Escolher" : "Adicionar"}<Plus aria-hidden />
        </button>
      </div>
    </div>
  </article>;
}
