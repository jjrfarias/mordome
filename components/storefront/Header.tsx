"use client";

import { UserRound, Search, ShoppingCart, X } from "lucide-react";
import { BrandMark, cx } from "./primitives";
import styles from "./storefront.module.css";

export type NavItem = { id: string; label: string };

export function SearchBar({ value, onChange, onSubmit, className, id }: { value: string; onChange: (value: string) => void; onSubmit: () => void; className?: string; id: string }) {
  return <form role="search" className={cx(styles.search, className)} onSubmit={event => { event.preventDefault(); onSubmit(); }}>
    <label htmlFor={id} className={styles.visuallyHidden}>Buscar no cardápio</label>
    <Search aria-hidden className={styles.searchIcon} />
    <input id={id} type="search" value={value} onChange={event => onChange(event.target.value)} placeholder="Busque por pratos, categorias..." autoComplete="off" enterKeyHint="search" />
    {value && <button type="button" className={styles.searchClear} onClick={() => onChange("")} aria-label="Limpar busca"><X aria-hidden /></button>}
  </form>;
}

export function Header({ logoUrl, name, unitName, nav, activeSection, query, onQueryChange, onSearchSubmit, cartUnits, onCartClick, onAccountClick, signedIn }: {
  logoUrl: string | null;
  name: string;
  unitName: string;
  nav: NavItem[];
  activeSection: string;
  query: string;
  onQueryChange: (value: string) => void;
  onSearchSubmit: () => void;
  onAccountClick?: () => void;
  signedIn?: boolean;
  cartUnits: number;
  onCartClick: () => void;
}) {
  return <header className={styles.header}>
    <div className={styles.headerInner}>
      <div className={styles.clientIdentity}>
        <a href="#inicio" className={styles.brandLink} aria-label={`${name} — início`}><BrandMark logoUrl={logoUrl} name={name} unitName={unitName} /></a>
        <span className={styles.mordomeSignature}>Tecnologia <strong>Mordomê</strong></span>
      </div>
      <nav className={styles.nav} aria-label="Seções da página">
        <ul>{nav.map(item => <li key={item.id}><a href={`#${item.id}`} className={cx(styles.navLink, activeSection === item.id && styles.navLinkActive)} aria-current={activeSection === item.id ? "location" : undefined}>{item.label}</a></li>)}</ul>
      </nav>
      <SearchBar id="busca-cabecalho" value={query} onChange={onQueryChange} onSubmit={onSearchSubmit} className={styles.headerSearch} />
      {onAccountClick && <button type="button" className={styles.cartButton} onClick={onAccountClick} aria-label={signedIn ? "Minha conta" : "Entrar com WhatsApp"}><UserRound aria-hidden /></button>}
      <button type="button" className={styles.cartButton} onClick={onCartClick} aria-label={cartUnits === 0 ? "Meu pedido, vazio" : `Meu pedido, ${cartUnits} ${cartUnits === 1 ? "unidade" : "unidades"}`}>
        <ShoppingCart aria-hidden />
        {cartUnits > 0 && <span className={styles.cartBadge} aria-hidden>{cartUnits > 99 ? "99+" : cartUnits}</span>}
      </button>
    </div>
    <div className={styles.mobileSearchRow}>
      <SearchBar id="busca-mobile" value={query} onChange={onQueryChange} onSubmit={onSearchSubmit} />
    </div>
  </header>;
}
