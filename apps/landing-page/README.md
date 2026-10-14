# Brismarp Pay — landing page

Site institucional em Next.js + React + TypeScript, com exportação totalmente estática. Não usa API própria, banco de dados, autenticação, cookies de sessão ou variáveis de ambiente.

Os botões de cadastro e login direcionam para `https://app.brismarppay.com.br`. O contato abre o cliente de e-mail do visitante. A cobrança exibida na página é uma ilustração, sem processamento real. O exemplo de API usa o contrato de `apps/api`, sem executar requisições.

## Desenvolvimento

```bash
cd apps/landing-page
npm ci
npm run dev
```

Acesse http://localhost:3002. O app web continua na porta 3000.

## Verificação e build

```bash
npm run build
npm run check
```

O build produz `out/`, que pode ser hospedado em qualquer servidor estático. Não é necessário `next start` ou processo Node em produção.

## Vercel

Crie um projeto separado com Root Directory `apps/landing-page`, framework Next.js e Build Command `npm run build`. Não configure variáveis de banco ou URL de backend. Em hospedagens estáticas genéricas, publique o diretório `out/`.

A pasta antiga era um projeto React/Vite com Express, tRPC, MySQL/Drizzle e contas próprias. Essa estrutura foi removida; contas, análise de empresa e operação de pagamentos pertencem a `apps/web` e `apps/api`.
