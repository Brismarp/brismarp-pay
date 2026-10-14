import type { Metadata } from "next";
import "./globals.css";
import { MotionEffects } from "./motion-effects";

export const metadata: Metadata = {
  title: "Brismarp Pay | Pagamentos para desenvolvedores e negócios",
  description:
    "Integre cobranças por API ou gerencie sua operação pelo painel. Pix, boleto e cartão com Brismarp Pay.",
  openGraph: {
    title: "Brismarp Pay — seu negócio, seu próximo pagamento.",
    description:
      "Uma API para integrar. Um painel para operar. Pagamentos para desenvolvedores e negócios.",
    locale: "pt_BR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <MotionEffects />
        {children}
      </body>
    </html>
  );
}
