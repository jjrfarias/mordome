"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Search, ShoppingBag, UtensilsCrossed } from "lucide-react";

type MenuProduct = { id: string; name: string; category: string; description: string | null; price: number; imageUrl: string | null };
type HighlightProduct = { id: string; name: string; price: number; imageUrl: string | null };
type MenuData = { establishment: { name: string; logoUrl: string | null; bannerUrl: string | null; highlightHeadline: string | null; highlightProduct: HighlightProduct | null }; products: MenuProduct[] };

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function groupByCategory(products: MenuProduct[]) {
  const groups = new Map<string, MenuProduct[]>();
  for (const product of products) groups.set(product.category, [...(groups.get(product.category) ?? []), product]);
  return [...groups.entries()];
}

export default function PublicMenuPage() {
  const params = useParams<{ establishmentId: string }>();
  const [data, setData] = useState<MenuData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => { queueMicrotask(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/public/menu/${params.establishmentId}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Não foi possível carregar o cardápio.");
      setData(json);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar o cardápio."); } finally { setLoading(false); }
  }); }, [params.establishmentId]);

  if (loading) return <div className="public-menu"><div className="empty"><span>Carregando cardápio…</span></div></div>;
  if (error) return <div className="public-menu"><div className="public-menu-header"><Image src="/clientes/betao/simbolo-compacto-v1.png" alt="" width={56} height={56} priority /><h1>Cardápio indisponível</h1></div><div className="auth-error">{error}</div></div>;
  if (!data) return null;

  const visible = data.products.filter(product => product.name.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  const grouped = groupByCategory(visible);

  const highlight = data.establishment.highlightProduct;

  return <div className="public-menu">
    {data.establishment.bannerUrl && <div className="public-menu-banner"><img src={data.establishment.bannerUrl} alt="" /></div>}
    <div className={`public-menu-header${data.establishment.bannerUrl ? " with-banner" : ""}`}>
      {data.establishment.logoUrl ? <img src={data.establishment.logoUrl} alt="" width={56} height={56} className="public-menu-logo" /> : <Image src="/clientes/betao/simbolo-compacto-v1.png" alt="" width={56} height={56} priority />}
      <div className="public-menu-heading">
        <span className="section-kicker">CARDÁPIO ONLINE</span>
        <h1>{data.establishment.name}</h1>
      </div>
    </div>
    <div className={`public-menu-actions${data.establishment.bannerUrl ? "" : " centered"}`}>
      <div className="search public-menu-search"><Search/><input placeholder="Buscar produto..." value={query} onChange={event => setQuery(event.target.value)} /></div>
      <Link href={`/pedido-online/${params.establishmentId}`} className="primary" style={{ textDecoration: "none" }}><ShoppingBag style={{ width: 16 }} /> Fazer pedido online</Link>
    </div>

    {highlight && <section className="public-menu-highlight">
      <div className="public-menu-highlight-photo">{highlight.imageUrl ? <img src={highlight.imageUrl} alt="" /> : <UtensilsCrossed />}</div>
      <div className="public-menu-highlight-body"><span>{data.establishment.highlightHeadline || "Destaque"}</span><b>{highlight.name}</b><strong>{money(highlight.price)}</strong></div>
    </section>}

    {data.products.length === 0 ? <div className="big-empty"><UtensilsCrossed/><h2>Cardápio em preparação</h2><p>Nenhum produto disponível para consulta online no momento.</p></div> : <div className="public-menu-groups">
      {grouped.map(([category, products]) => <section className="public-menu-category" key={category}>
        <h2>{category}</h2>
        {products.map(product => <article className="public-menu-item" key={product.id}>
          <div className="public-menu-item-photo">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <UtensilsCrossed />}</div>
          <div className="public-menu-item-body"><b>{product.name}</b>{product.description && <p>{product.description}</p>}</div>
          <strong>{money(product.price)}</strong>
        </article>)}
      </section>)}
      {visible.length === 0 && <div className="empty"><span>Nenhum produto encontrado para essa busca.</span></div>}
    </div>}

    <footer className="public-menu-footer">Mordomê <em>by JCS</em></footer>
  </div>;
}
