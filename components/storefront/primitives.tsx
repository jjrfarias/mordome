"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChefHat, Star, UtensilsCrossed, X } from "lucide-react";
import styles from "./storefront.module.css";

export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

// Diálogo sobre o <dialog> nativo: foco preso no conteúdo, Esc fecha e o foco volta ao elemento que
// abriu. A rolagem da página fica travada enquanto qualquer diálogo estiver aberto.
export function Dialog({ open, onClose, title, description, variant = "center", size = "md", children, footer }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; variant?: "center" | "sheet"; size?: "sm" | "md" | "lg"; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      document.documentElement.dataset.storefrontDialogs = String(Number(document.documentElement.dataset.storefrontDialogs ?? 0) + 1);
      document.documentElement.style.overflow = "hidden";
      return () => {
        if (dialog.open) dialog.close();
        const remaining = Math.max(0, Number(document.documentElement.dataset.storefrontDialogs ?? 1) - 1);
        document.documentElement.dataset.storefrontDialogs = String(remaining);
        if (remaining === 0) document.documentElement.style.overflow = "";
      };
    }
  }, [open]);

  if (!open) return null;
  return <dialog ref={ref} aria-labelledby={titleId} className={cx(styles.dialog, variant === "sheet" && styles.dialogSheet, styles[`dialog_${size}`])}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={styles.dialogBody}>
      <header className={styles.dialogHeader}>
        <div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div>
        <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Fechar"><X aria-hidden /></button>
      </header>
      <div className={styles.dialogContent}>{children}</div>
      {footer && <footer className={styles.dialogFooter}>{footer}</footer>}
    </div>
  </dialog>;
}

export function SafeImage({ src, alt, className, eager = false, sizes }: { src: string | null; alt: string; className?: string; eager?: boolean; sizes?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return <div className={cx(styles.imageFallback, className)} role={alt ? "img" : undefined} aria-label={alt || undefined}><UtensilsCrossed aria-hidden /></div>;
  // Fotos do catálogo podem ser data URLs comprimidas no cadastro (ADR 0032/0053), por isso <img>.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : undefined} decoding="async" sizes={sizes} onError={() => setFailedSrc(src)} />;
}

export function BrandMark({ logoUrl, name, unitName }: { logoUrl: string | null; name: string; unitName: string }) {
  return <span className={styles.brand}>
    {logoUrl ? <SafeImage src={logoUrl} alt="" className={styles.brandLogo} eager /> : <span className={styles.brandFallback}><ChefHat aria-hidden strokeWidth={2.3} /></span>}
    <span className={styles.brandText}><strong>{name}</strong><small>{unitName !== name ? `Unidade ${unitName} · ` : ""}Pedido online</small></span>
  </span>;
}

export function Rating({ average, count }: { average: number; count: number }) {
  return <span className={styles.rating}>
    <Star aria-hidden className={styles.ratingStar} />
    <span className={styles.visuallyHidden}>Avaliação</span>
    <b>{average.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</b>
    <span>({count.toLocaleString("pt-BR")}<span className={styles.visuallyHidden}> avaliações</span>)</span>
  </span>;
}

// `group`: um aviso novo do mesmo grupo substitui o anterior (ex.: vários "adicionado ao pedido").
export type Toast = { id: number; message: string; tone?: "default" | "warning"; group?: string; action?: { label: string; run: () => void } };

// Com um <dialog> modal aberto, o resto da página fica inerte e abaixo da camada superior; os avisos
// são então renderizados dentro do diálogo do topo para continuarem visíveis e clicáveis ("Desfazer").
function useTopDialog() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const update = () => setTarget([...document.querySelectorAll<HTMLDialogElement>("dialog[open]")].at(-1) ?? null);
    const observer = new MutationObserver(update);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
    queueMicrotask(update);
    return () => observer.disconnect();
  }, []);
  return target;
}

export function ToastRegion({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  const target = useTopDialog();
  const region = <ToastList toasts={toasts} onDismiss={onDismiss} />;
  return target ? createPortal(region, target) : region;
}

function ToastList({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return <div className={styles.toastRegion} role="status" aria-live="polite">
    {toasts.map(toast => <div key={toast.id} className={cx(styles.toast, toast.tone === "warning" && styles.toastWarning)}>
      <span>{toast.message}</span>
      {toast.action && <button type="button" onClick={() => { toast.action!.run(); onDismiss(toast.id); }}>{toast.action.label}</button>}
      <button type="button" className={styles.toastClose} onClick={() => onDismiss(toast.id)} aria-label="Dispensar aviso"><X aria-hidden /></button>
    </div>)}
  </div>;
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const dismiss = (id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts(current => current.filter(toast => toast.id !== id));
  };
  const push = (toast: Omit<Toast, "id">, durationMs = 4000) => {
    const id = nextId.current++;
    setToasts(current => [...current.filter(item => !toast.group || item.group !== toast.group).slice(-2), { ...toast, id }]);
    timers.current.set(id, setTimeout(() => dismiss(id), toast.action ? Math.max(durationMs, 6000) : durationMs));
  };
  useEffect(() => { const pending = timers.current; return () => pending.forEach(timer => clearTimeout(timer)); }, []);
  return { toasts, push, dismiss };
}
