const APP_URL = "https://app.brismarppay.com.br";
const REGISTER_URL = `${APP_URL}/register`;
const CONTACT_URL = "mailto:suportebrismarp@gmail.com";

function Brand() {
  return (
    <a className="brand" href="#inicio" aria-label="Brismarp Pay — início">
      <svg width="32" height="36" viewBox="0 0 34 36" aria-hidden="true">
        <path
          d="M7 3h12a7 7 0 0 1 0 14H7zM7 19h12a7 7 0 0 1 0 14H7z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <path d="M7 10h7M7 26h7" stroke="currentColor" strokeWidth="2.5" />
      </svg>
      <span>
        Brismarp<span className="brand-pay">Pay</span>
      </span>
    </a>
  );
}

const features = [
  [
    "01",
    "Cobranças em um só lugar",
    "Crie cobranças, acompanhe o status e consulte o histórico de cada pagamento pelo painel.",
  ],
  [
    "02",
    "Clientes organizados",
    "Cadastre seus clientes e tenha o histórico de cobranças conectado à sua operação.",
  ],
  [
    "03",
    "Controle para sua equipe",
    "Organize o acesso por empresa e por função, com permissões para diferentes responsabilidades.",
  ],
  [
    "04",
    "Visibilidade financeira",
    "Consulte saldo, movimentações, taxas e resultados por período para acompanhar seu negócio.",
  ],
];

const code = `curl -X POST "$API_URL/v1/companies/$COMPANY_ID/charges" \\
  -H "X-Api-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "method": "PIX",
    "amountCents": 12900,
    "customerId": "<UUID_DO_CLIENTE>",
    "idempotencyKey": "pedido-1042"
  }'`;

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#conteudo">
        Ir para o conteúdo
      </a>
      <header className="header">
        <div className="container header-inner">
          <Brand />
          <nav aria-label="Navegação principal">
            <a href="#produto">Produto</a>
            <a href="#desenvolvedores">Desenvolvedores</a>
            <a href="#duvidas">Dúvidas</a>
          </nav>
          <a className="login-link" href={`${APP_URL}/login`}>
            Entrar <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>
      <main id="conteudo">
        <section className="hero" id="inicio">
          <div className="container hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">
                <span className="status-dot" /> PAGAMENTOS QUE CONECTAM
              </p>
              <h1>
                Seu negócio.
                <br />
                Seu código.
                <br />
                <span>
                  Seu próximo
                  <br />
                  pagamento.
                </span>
              </h1>
              <p className="lede">
                Uma API para integrar. Um painel para operar. Receba com Pix,
                boleto e cartão e acompanhe suas cobranças com Brismarp Pay.
              </p>
              <div className="actions">
                <a className="button primary" href={REGISTER_URL}>
                  Começar agora <span aria-hidden="true">↗</span>
                </a>
                <a className="text-link" href="#desenvolvedores">
                  Conheça a integração <span aria-hidden="true">↓</span>
                </a>
              </div>
              <p className="hero-note">
                Para quem constrói software. Para quem faz negócios.
              </p>
            </div>
            <div
              className="payment-scene"
              aria-label="Ilustração do acompanhamento de uma cobrança"
            >
              <div className="scene-label">
                DA INTEGRAÇÃO À OPERAÇÃO <span>01 / 03</span>
              </div>
              <div className="payment-card">
                <div className="payment-top">
                  <span className="mini-mark">
                    B<span>Pay</span>
                  </span>
                  <span className="demo-label">EXEMPLO ILUSTRATIVO</span>
                </div>
                <p className="card-label">Sua próxima venda</p>
                <p className="payment-amount">
                  R$ 129<span>,00</span>
                </p>
                <div className="payment-method">
                  <span className="pix-icon" aria-hidden="true">
                    ◇
                  </span>
                  <div>
                    <strong>Pagamento via Pix</strong>
                    <span>Cobrança #1042</span>
                  </div>
                </div>
                <div className="payment-confirmed">
                  <span aria-hidden="true">✓</span> Pagamento confirmado
                </div>
                <div className="payment-footer">
                  <span>Um fluxo. Mais controle.</span>
                  <span aria-hidden="true">↗</span>
                </div>
              </div>
              <div className="event-card">
                <span className="event-icon" aria-hidden="true">
                  {"{ }"}
                </span>
                <div>
                  <span>STATUS DA COBRANÇA</span>
                  <code>APPROVED</code>
                </div>
                <span className="status-dot" />
              </div>
              <div className="scene-bottom">
                <span>INTEGRE.</span>
                <span>RECEBA.</span>
                <span>ACOMPANHE.</span>
              </div>
            </div>
          </div>
          <div className="container methods">
            <span>DO CHECKOUT AO SEU PAINEL</span>
            <strong>Pix</strong>
            <strong>Boleto</strong>
            <strong>Cartão</strong>
            <span className="methods-note">
              Disponibilidade conforme sua operação e o processador.
            </span>
          </div>
        </section>
        <section className="section container" id="produto">
          <div className="section-heading">
            <p className="eyebrow">01 / PARA NEGÓCIOS</p>
            <h2>
              Menos caminhos.
              <br />
              <span>Mais controle.</span>
            </h2>
            <p>
              Seu negócio precisa vender. O painel reúne o que você precisa para
              organizar os recebimentos e acompanhar cada etapa.
            </p>
          </div>
          <div className="feature-grid">
            {features.map(([number, title, text]) => (
              <article className="feature" key={number}>
                <span className="feature-number">
                  {number} <span aria-hidden="true">↗</span>
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="developer-section" id="desenvolvedores">
          <div className="container developer-grid">
            <div>
              <p className="eyebrow">02 / PARA DESENVOLVEDORES</p>
              <h2>
                Pagamentos que
                <br />
                falam a sua língua.
              </h2>
              <p className="section-description">
                Conecte seu produto à API REST do Brismarp Pay. Crie clientes e
                cobranças, consulte status e mantenha o controle da integração.
              </p>
              <ul className="developer-benefits">
                <li>
                  <span aria-hidden="true">↗</span> Chaves de API com escopos de
                  acesso
                </li>
                <li>
                  <span aria-hidden="true">↗</span> Idempotência na criação de
                  cobranças
                </li>
                <li>
                  <span aria-hidden="true">↗</span> Consulta de saldo e extrato
                  pela API
                </li>
              </ul>
              <a className="button light" href={REGISTER_URL}>
                Criar minha conta <span aria-hidden="true">↗</span>
              </a>
            </div>
            <div className="code-panel">
              <div className="code-header">
                <span>criar-cobranca.sh</span>
                <span>REST API</span>
              </div>
              <pre>
                <code>{code}</code>
              </pre>
              <div className="code-note">
                Exemplo de requisição · substitua as variáveis e o UUID pelos
                dados da sua conta.
              </div>
            </div>
          </div>
        </section>
        <section className="section container steps-section">
          <p className="eyebrow">03 / SEU PRÓXIMO PASSO</p>
          <div className="steps-heading">
            <h2>
              Do cadastro
              <br />
              <span>à sua operação.</span>
            </h2>
            <a className="text-link" href={REGISTER_URL}>
              Abrir minha conta <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="steps">
            <article>
              <span>01</span>
              <h3>Crie sua conta</h3>
              <p>Cadastre-se no app e informe os dados da sua empresa.</p>
            </article>
            <article>
              <span>02</span>
              <h3>Configure sua operação</h3>
              <p>
                Conclua o cadastro e acompanhe a análise da empresa pelo painel.
              </p>
            </article>
            <article>
              <span>03</span>
              <h3>Escolha como integrar</h3>
              <p>
                Use o painel ou configure suas chaves de API para conectar seu
                sistema.
              </p>
            </article>
          </div>
        </section>
        <section className="faq-section container" id="duvidas">
          <div>
            <p className="eyebrow">ANTES DE COMEÇAR</p>
            <h2>Vamos esclarecer.</h2>
            <a className="text-link" href={CONTACT_URL}>
              Fale com a equipe <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="faqs">
            <details>
              <summary>Preciso ser desenvolvedor para usar?</summary>
              <p>
                Não. Você pode cadastrar clientes, criar cobranças e acompanhar
                sua operação pelo painel. A API atende quem quer integrar essas
                funções ao próprio software.
              </p>
            </details>
            <details>
              <summary>Quais meios de pagamento posso usar?</summary>
              <p>
                O produto possui fluxos para Pix, boleto e cartão. A
                disponibilidade e as condições dependem da configuração da sua
                empresa e do processador de pagamentos.
              </p>
            </details>
            <details>
              <summary>Onde faço login ou cadastro?</summary>
              <p>
                O acesso acontece no app Brismarp Pay.{" "}
                <a href={`${APP_URL}/login`}>Entre na sua conta</a> ou{" "}
                <a href={REGISTER_URL}>faça seu cadastro</a> para começar.
              </p>
            </details>
            <details>
              <summary>Como conheço as condições comerciais?</summary>
              <p>
                Fale com a equipe pelo e-mail{" "}
                <a href={CONTACT_URL}>suportebrismarp@gmail.com</a> para
                conversar sobre o perfil da sua operação e as condições
                aplicáveis.
              </p>
            </details>
          </div>
        </section>
        <section className="closing container">
          <div>
            <p className="eyebrow">CONSTRUA SEU PRÓXIMO PASSO</p>
            <h2>
              Seu produto merece
              <br />
              um bom fluxo de pagamentos.
            </h2>
          </div>
          <a className="button primary" href={REGISTER_URL}>
            Começar com Brismarp Pay <span aria-hidden="true">↗</span>
          </a>
        </section>
      </main>
      <footer className="container footer">
        <div>
          <Brand />
          <p>Pagamentos para desenvolvedores e negócios.</p>
        </div>
        <div className="footer-links">
          <a href={`${APP_URL}/login`}>Acessar o app ↗</a>
          <a href={CONTACT_URL}>Contato ↗</a>
          <a href="#inicio">Voltar ao topo ↑</a>
        </div>
        <p className="copyright">
          © {new Date().getFullYear()} Brismarp Pay. Uma iniciativa Brismarp.
        </p>
      </footer>
    </>
  );
}
