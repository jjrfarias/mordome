"use client";

import { useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import type { HeroSlide } from "@/lib/storefront/model";
import { SafeImage, cx } from "./primitives";
import styles from "./storefront.module.css";

// Sem rotação automática: o cliente troca o destaque pelos controles, o que dispensa botão de pausa
// e respeita quem prefere menos movimento.
export function HeroBanner({ slides, onAction }: { slides: HeroSlide[]; onAction: (slide: HeroSlide) => void }) {
  const [index, setIndex] = useState(0);
  if (slides.length === 0) return null;
  const current = slides[Math.min(index, slides.length - 1)];
  const many = slides.length > 1;
  const go = (next: number) => setIndex((next + slides.length) % slides.length);

  return <section className={styles.hero} aria-roledescription={many ? "carrossel" : undefined} aria-label="Destaques">
    <div className={styles.heroSlide} key={current.id} aria-roledescription={many ? "slide" : undefined} aria-label={many ? `${index + 1} de ${slides.length}` : undefined}>
      <SafeImage src={current.imageUrl} alt={current.imageAlt} className={styles.heroImage} eager sizes="(min-width: 1180px) 70vw, 100vw" />
      <div className={styles.heroShade} aria-hidden />
      <div className={styles.heroCopy}>
        {current.kicker && <p className={styles.heroKicker}>{current.kicker}</p>}
        <h2 className={styles.heroTitle}>{current.title}{current.highlight && <>{" "}<span>{current.highlight}</span></>}</h2>
        {current.description && <p className={styles.heroText}>{current.description}</p>}
        <button type="button" className={cx(styles.primaryButton, styles.heroButton)} onClick={() => onAction(current)}>{current.ctaLabel}<ArrowRight aria-hidden /></button>
      </div>
    </div>
    {many && <>
      <button type="button" className={cx(styles.heroArrow, styles.heroArrowPrev)} onClick={() => go(index - 1)} aria-label="Destaque anterior"><ChevronLeft aria-hidden /></button>
      <button type="button" className={cx(styles.heroArrow, styles.heroArrowNext)} onClick={() => go(index + 1)} aria-label="Próximo destaque"><ChevronRight aria-hidden /></button>
      <div className={styles.heroDots}>
        {slides.map((slide, slideIndex) => <button key={slide.id} type="button" className={cx(styles.heroDot, slideIndex === index && styles.heroDotActive)} onClick={() => go(slideIndex)} aria-label={`Ir para o destaque ${slideIndex + 1}: ${slide.title}`} aria-current={slideIndex === index ? "true" : undefined} />)}
      </div>
    </>}
  </section>;
}
