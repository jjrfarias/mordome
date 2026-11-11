import Link from "next/link";
import styles from "./legal.module.css";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.page}><header className={styles.header}><Link className={styles.brand} href="/">Mordomê</Link><nav className={styles.nav} aria-label="Privacidade e dados"><Link href="/privacidade">Privacidade</Link><Link href="/exclusao-de-dados">Exclusão de dados</Link></nav></header><main className={styles.content}>{children}</main><footer className={styles.footer}>Mordomê · Jordão Consultoria<br/><a href="mailto:jorgefarias@jordaoconsultoria.com">jorgefarias@jordaoconsultoria.com</a></footer></div>;
}
