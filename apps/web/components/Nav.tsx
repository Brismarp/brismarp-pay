"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";

const LINKS = [
  { href: "/dashboard", label: "Visão geral", icon: "◫" },
  { href: "/customers", label: "Clientes", icon: "◎" },
  { href: "/charges", label: "Cobranças", icon: "↗" },
  { href: "/api-keys", label: "Chaves de API", icon: "{ }" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resent, setResent] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem("bpay_access_token");
    if (!token) return;
    apiClient
      .me(token)
      .then((me) => setNeedsVerification(!me.emailVerifiedAt))
      .catch(() => setNeedsVerification(false));
  }, []);

  async function resend() {
    const token = sessionStorage.getItem("bpay_access_token");
    if (!token) return;
    await apiClient.resendVerification(token);
    setResent(true);
  }

  async function handleLogout() {
    try {
      await apiClient.logout();
    } catch {
      // still drop the local session if the cookie is already gone
    }
    sessionStorage.removeItem("bpay_access_token");
    router.push("/login");
  }

  return (
    <>
      <div className="merchant-mobile-header">
        <Link
          href="/dashboard"
          className="merchant-brand"
          aria-label="Brismar Pay, visão geral"
          onClick={() => setMenuOpen(false)}
        >
          <span className="merchant-brand-mark" aria-hidden="true">
            B
          </span>
          <span>
            Brismar<span>Pay</span>
          </span>
        </Link>
        <button
          type="button"
          className="merchant-menu-toggle"
          aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuOpen}
          aria-controls="merchant-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
        </button>
      </div>

      {menuOpen && (
        <button
          type="button"
          className="merchant-menu-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside className={`merchant-sidebar${menuOpen ? " is-open" : ""}`}>
        <Link
          href="/dashboard"
          className="merchant-brand merchant-sidebar-brand"
          aria-label="Brismar Pay, visão geral"
        >
          <span className="merchant-brand-mark" aria-hidden="true">
            B
          </span>
          <span>
            Brismar<span>Pay</span>
          </span>
        </Link>

        <p className="merchant-nav-caption">OPERAÇÃO</p>
        <nav
          id="merchant-navigation"
          className="merchant-nav-links"
          aria-label="Navegação principal"
        >
          {LINKS.map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== "/dashboard" && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                aria-current={active ? "page" : undefined}
                className={active ? "is-active" : ""}
              >
                <span className="merchant-nav-icon" aria-hidden="true">
                  {link.icon}
                </span>
                {link.label}
                {active && (
                  <span className="merchant-nav-indicator" aria-hidden="true" />
                )}
              </Link>
            );
          })}
        </nav>

        {needsVerification && (
          <div className="merchant-verification">
            <span className="verification-indicator" aria-hidden="true" />
            <div>
              <strong>E-mail pendente</strong>
              {resent ? (
                <span>Link enviado.</span>
              ) : (
                <button type="button" onClick={resend}>
                  Reenviar confirmação
                </button>
              )}
            </div>
          </div>
        )}

        <div className="merchant-sidebar-footer">
          <Link href="/account/password">
            <span aria-hidden="true">⚙</span> Segurança da conta
          </Link>
          <button type="button" data-testid="nav-logout" onClick={handleLogout}>
            <span aria-hidden="true">↗</span> Sair da conta
          </button>
          <div className="merchant-footer-brand">
            <span className="merchant-brand-mark" aria-hidden="true">
              B
            </span>
            <span>
              <strong>BrismarPay</strong>
              <small>Pagamentos com clareza.</small>
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
