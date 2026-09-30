import { Clock, MapPin, Phone } from "lucide-react";
import type { StorefrontData } from "@/lib/storefront/model";
import styles from "./storefront.module.css";

export function InfoSections({ data }: { data: StorefrontData }) {
  const hasContact = Boolean(data.establishment.phone || data.establishment.address);
  if (!data.about && data.stores.length === 0 && !hasContact) return null;
  return <div className={styles.info}>
    {data.about && <section id="sobre" className={styles.infoBlock} aria-labelledby="titulo-sobre">
      <h2 id="titulo-sobre">Sobre nós</h2>
      <p>{data.about}</p>
    </section>}
    {data.stores.length > 0 && <section id="lojas" className={styles.infoBlock} aria-labelledby="titulo-lojas">
      <h2 id="titulo-lojas">Nossas lojas</h2>
      <ul className={styles.storeList}>{data.stores.map(store => <li key={store.name}>
        <b>{store.name}</b>
        <span><MapPin aria-hidden />{store.address}</span>
        <span><Clock aria-hidden />{store.hours}</span>
      </li>)}</ul>
    </section>}
    {hasContact && <section id="contato" className={styles.infoBlock} aria-labelledby="titulo-contato">
      <h2 id="titulo-contato">Contato</h2>
      <ul className={styles.storeList}><li>
        <b>{data.establishment.name}</b>
        {data.establishment.address && <span><MapPin aria-hidden />{data.establishment.address}</span>}
        {data.establishment.phone && <span><Phone aria-hidden /><a href={`tel:${data.establishment.phone.replace(/\D/g, "")}`}>{data.establishment.phone}</a></span>}
      </li></ul>
    </section>}
  </div>;
}
