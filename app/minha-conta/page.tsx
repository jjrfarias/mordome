import { AccountSecurityPage } from "@/components/auth/AccountSecurityPage";
export const metadata = { title: "Segurança da conta — Mordomê", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default function Page() { return <AccountSecurityPage mode="account" />; }
