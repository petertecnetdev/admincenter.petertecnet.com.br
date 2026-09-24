import { createRoot } from 'react-dom/client'
import './SeoFaqSection.css'

const ROOT_ID = 'peter-seo-faq-root'

const faqItems = [
  {
    question: 'Quanto custa desenvolver um sistema para minha empresa?',
    answer: <p>O custo depende do problema, número de usuários, integrações, automações e nível de personalização. A Peter Tecnet pode partir de uma solução já existente no ecossistema ou desenvolver software sob medida. <a href="/#contato">Conte o que você precisa</a> para avaliarmos o caminho mais adequado.</p>,
  },
  {
    question: 'Onde contratar desenvolvimento de software sob medida?',
    answer: <p>A Peter Tecnet desenvolve sistemas, aplicativos, APIs, integrações, bancos de dados, automações e soluções com inteligência artificial para operações que precisam de algo além de uma ferramenta pronta. Veja também nosso <a href="/#catalogo">catálogo de produtos e serviços</a>.</p>,
  },
  {
    question: 'Como criar um aplicativo para minha empresa?',
    answer: <p>O primeiro passo é definir qual problema o aplicativo precisa resolver, quem vai usá-lo e quais dados ou sistemas precisam conversar com ele. A Peter Tecnet trabalha com aplicações web instaláveis, plataformas integradas e desenvolvimento personalizado, priorizando segurança, desempenho e evolução do produto.</p>,
  },
  {
    question: 'Como criar um site ou landing page profissional para minha empresa?',
    answer: <p>Uma boa página precisa unir carregamento rápido, experiência mobile, conteúdo claro, SEO, conversão e integração com as ferramentas da operação. A Peter Tecnet cria sites, landing pages e experiências digitais conectadas a APIs, formulários, catálogos e outros serviços.</p>,
  },
  {
    question: 'Como automatizar tarefas repetitivas de uma empresa?',
    answer: <p>É possível automatizar cadastros, notificações, relatórios, integrações, atendimento, acompanhamento comercial e rotinas internas. Nós analisamos o fluxo atual, identificamos tarefas repetitivas e conectamos sistemas por APIs, regras e automações para reduzir trabalho manual.</p>,
  },
  {
    question: 'Como integrar dois sistemas usando uma API?',
    answer: <p>A integração normalmente envolve autenticação, definição dos dados compartilhados, regras de sincronização, tratamento de falhas e monitoramento. A Peter Tecnet desenvolve e integra APIs para que sistemas diferentes compartilhem dados com segurança e de forma reutilizável.</p>,
  },
  {
    question: 'Como criar um catálogo digital com QR Code para produtos e serviços?',
    answer: <p>Com a <a href="/plataformas/nexus">Nexus</a>, produtos e serviços podem ser organizados em um catálogo digital e compartilhados de forma prática. A estrutura também pode ser integrada a páginas públicas, QR Codes e outras partes do ecossistema Peter Tecnet.</p>,
  },
  {
    question: 'Qual sistema usar para agendamento online de serviços?',
    answer: <p>A <a href="/plataformas/rasoio">Rasoio</a> é uma plataforma do ecossistema Peter Tecnet voltada à organização de serviços, profissionais, disponibilidade e agendamentos. Para operações com regras específicas, também podemos adaptar ou desenvolver fluxos sob medida.</p>,
  },
  {
    question: 'Como vender ingressos e fazer check-in por QR Code em eventos?',
    answer: <p>A <a href="/plataformas/cutinapp">Cutinapp</a> foi criada para operações de eventos, incluindo divulgação, ingressos, participantes, promoters e check-in. A proposta é concentrar a jornada do evento em uma experiência digital conectada.</p>,
  },
  {
    question: 'Como organizar clientes, propostas, cobranças e follow-up?',
    answer: <p>A <a href="/plataformas/payflow">PayFlow</a> organiza a jornada comercial entre cliente, oportunidade, proposta, cobrança e acompanhamento. Isso ajuda a centralizar informações e reduzir o risco de perder vendas ou retornos importantes.</p>,
  },
  {
    question: 'Como usar inteligência artificial em uma empresa?',
    answer: <p>IA pode apoiar atendimento, classificação de informações, análise de dados, geração de conteúdo, automação de processos e suporte à tomada de decisão. O melhor uso depende do processo e dos dados disponíveis; por isso a implementação deve começar pelo problema, não pela tecnologia.</p>,
  },
  {
    question: 'A Peter Tecnet atende projetos pequenos e serviços digitais simples?',
    answer: <p>Sim. Além de software, aplicativos e integrações mais avançadas, a Peter Tecnet também atende demandas digitais menores quando elas podem ser resolvidas com tecnologia. A ideia é encontrar a solução proporcional ao problema, sem transformar uma necessidade simples em um projeto desnecessariamente complexo.</p>,
  },
]

function SeoFaqSection() {
  return <section className="mkt-seo-faq" id="faq" aria-labelledby="faq-title">
    <div className="mkt-container">
      <div className="mkt-section-heading is-split mkt-seo-faq-heading">
        <div>
          <p className="mkt-kicker">PERGUNTAS QUE COMEÇAM NO GOOGLE</p>
          <h2 id="faq-title">Dúvidas reais sobre tecnologia, <span>respondidas de forma direta.</span></h2>
        </div>
        <p>Reunimos perguntas comuns de quem procura software, aplicativos, sites, automação, APIs, eventos, agendamento e gestão comercial. Encontre a resposta e siga para a solução relacionada.</p>
      </div>

      <div className="mkt-seo-faq-grid">
        {faqItems.map((item, index) => <details className="mkt-seo-faq-item" key={item.question} open={index === 0}>
          <summary>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{item.question}</strong>
            <i aria-hidden="true">+</i>
          </summary>
          <div className="mkt-seo-faq-answer">{item.answer}</div>
        </details>)}
      </div>

      <div className="mkt-seo-faq-cta">
        <div><small>NÃO ENCONTROU A SUA DÚVIDA?</small><strong>Descreva o problema. A solução pode já existir ou pode ser construída.</strong></div>
        <a className="mkt-btn is-primary" href="/#contato">Falar com a Peter Tecnet <span>↗</span></a>
      </div>
    </div>
  </section>
}

export default function installSeoFaqSection() {
  if (typeof document === 'undefined') return

  const mount = () => {
    if (document.getElementById(ROOT_ID)) return true
    const anchor = document.querySelector('.mkt-blog-preview')
    if (!anchor?.parentNode) return false

    const host = document.createElement('div')
    host.id = ROOT_ID
    anchor.insertAdjacentElement('afterend', host)
    createRoot(host).render(<SeoFaqSection />)
    return true
  }

  if (mount()) return

  const observe = () => {
    if (!document.body) return false
    const observer = new MutationObserver(() => {
      if (mount()) observer.disconnect()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    window.setTimeout(() => observer.disconnect(), 15000)
    return true
  }

  if (!observe()) {
    document.addEventListener('DOMContentLoaded', observe, { once: true })
  }
}
