import { useEffect } from 'react'
import './MarketingExperience.css'
import './PublicDiscoveryExperience.css'
import './PetriniaCutinappStory.css'
import { trackDiscoveryEvent } from './discoveryApi.js'
import { updatePageSeo } from './seo.js'

const SLUG = 'petrinia-cutinapp-persistencia-tecnologia'
const PATH = `/blog/${SLUG}`
const COVER = 'https://petertecnet.com.br/blog/petrinia-cutinapp-cover.svg'
const SOCIAL_IMAGE = 'https://cutinapp.petertecnet.com.br/images/cutinapp.png'

const sections = [
  {
    id: 'uma-ideia-que-parecia-simples',
    title: 'Uma ideia que parecia simples',
    paragraphs: [
      'Um dia, uma pergunta começou a ocupar seus pensamentos: e se existisse uma forma mais simples de descobrir eventos, comprar ingressos, divulgar produções e conectar pessoas a experiências incríveis?',
      'A ideia parecia ótima. Na cabeça de Petrínia, tudo se encaixava: produtores poderiam organizar seus eventos, participantes encontrariam novas experiências, ingressos seriam digitais e o check-in poderia acontecer de maneira rápida e segura.',
      'Então ela decidiu transformar aquela ideia em uma aplicação. Foi assim que começou a nascer a Cutinapp.',
    ],
  },
  {
    id: 'quando-os-problemas-apareceram',
    title: 'Quando os problemas apareceram',
    paragraphs: [
      'A empolgação dos primeiros dias logo encontrou a realidade do desenvolvimento de software. Vieram telas que não se comportavam como deveriam, integrações que pareciam simples até serem testadas de verdade, fluxos que precisavam ser repensados e bugs que surgiam justamente quando tudo parecia estar funcionando.',
      'Em determinado momento, Petrínia enfrentou o maior problema do projeto. Uma falha técnica começou a atingir várias partes da aplicação ao mesmo tempo. Corrigir uma funcionalidade parecia provocar um problema em outra. Testes falhavam. Integrações deixavam de responder. Algumas tentativas de solução simplesmente criavam novos desafios.',
      'Ela ficou cansada. Em alguns momentos, chegou a se perguntar se tinha sonhado grande demais. Mas desistir nunca combinou muito com Petrínia.',
    ],
  },
  {
    id: 'quando-a-historia-encontrou-a-peter-tecnet',
    title: 'Quando a história encontrou a Peter Tecnet',
    paragraphs: [
      'Foi no meio dessa caminhada que o projeto encontrou espaço dentro da Peter Tecnet.',
      'A ideia deixou de ser apenas um projeto isolado e passou a fazer parte de um ecossistema maior de tecnologia. Com arquitetura, planejamento, testes, integrações e uma visão mais ampla de produto, Petrínia continuou trabalhando para fazer a Cutinapp evoluir.',
      'O objetivo não era apenas colocar uma aplicação no ar. Era construir algo que pudesse ser útil de verdade.',
    ],
  },
  {
    id: 'o-problema-que-quase-parou-tudo',
    title: 'O problema que quase parou tudo',
    paragraphs: [
      'O desafio técnico continuava ali. Petrínia revisou código, refez fluxos, testou possibilidades, descartou soluções que não eram suficientemente boas e voltou várias vezes ao mesmo problema.',
      'Só que cada tentativa deixava uma pista. Pouco a pouco, aquilo que parecia um enorme problema começou a ser dividido em partes menores. Uma correção resolveu um fluxo. Outra estabilizou uma integração. Os testes começaram a passar. A aplicação ficou mais rápida, mais organizada e mais confiável.',
      'Até que chegou o momento em que tudo finalmente funcionou junto.',
    ],
  },
  {
    id: 'a-cutinapp-ganhou-vida',
    title: 'A Cutinapp ganhou vida',
    paragraphs: [
      'A Cutinapp deixou de ser apenas uma ideia. Ela passou a representar uma nova maneira de aproximar produtores, eventos e pessoas. Divulgação, descoberta de eventos, ingressos digitais, experiências e check-in passaram a fazer parte de uma mesma jornada.',
      'E o resultado foi maior do que simplesmente concluir um projeto. O trabalho trouxe aprendizado, evolução técnica, novas possibilidades comerciais e espaço para crescimento. Aquilo que começou com uma pergunta se transformou em uma plataforma capaz de gerar oportunidades e ajudar negócios ligados a eventos a avançar.',
    ],
  },
  {
    id: 'o-que-petrinia-aprendeu',
    title: 'O que Petrínia aprendeu',
    paragraphs: [
      'Quando olhou para tudo que havia construído, Petrínia percebeu que desenvolver tecnologia nunca foi sobre não encontrar problemas. Foi sobre continuar quando eles apareceram.',
      'Foi sobre transformar erro em informação, dificuldade em aprendizado e uma ideia em algo que outras pessoas pudessem realmente utilizar.',
      'A história da Cutinapp não terminou quando o primeiro grande problema foi resolvido. Na verdade, foi ali que uma nova etapa começou. Porque produtos evoluem. Empresas evoluem. Pessoas evoluem.',
      'E algumas das melhores histórias da tecnologia começam exatamente assim: com alguém olhando para uma ideia difícil e dizendo — eu acho que consigo fazer isso.',
    ],
  },
]

export default function PetriniaCutinappStory() {
  useEffect(() => {
    updatePageSeo({
      title: 'Petrínia e a Cutinapp: persistência, tecnologia e inovação | Peter Tecnet',
      description: 'A história de Petrínia e da criação da Cutinapp: desafios técnicos, persistência, desenvolvimento de software e a transformação de uma ideia em uma plataforma para eventos.',
      path: PATH,
      image: SOCIAL_IMAGE,
      type: 'article',
      schema: [{
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Petrínia e a Cutinapp: quando persistência transforma uma ideia em tecnologia',
        description: 'Conheça Petrínia, uma garota determinada que enfrentou erros, dúvidas e um grande desafio técnico até transformar uma ideia na Cutinapp.',
        datePublished: '2026-09-04',
        dateModified: '2026-09-04',
        mainEntityOfPage: `https://petertecnet.com.br${PATH}`,
        author: { '@type': 'Organization', name: 'Peter Tecnet' },
        publisher: { '@type': 'Organization', name: 'Peter Tecnet', url: 'https://petertecnet.com.br' },
        image: SOCIAL_IMAGE,
      }],
    })

    try {
      trackDiscoveryEvent('content_view', {
        entityType: 'content',
        entityId: SLUG,
        application: 'cutinapp',
      })
    } catch {
      // Telemetria nunca deve impedir a leitura da história.
    }
  }, [])

  return <div className="mkt-shell discovery-shell petrinia-story-shell">
    <header className="mkt-header">
      <a className="mkt-brand" href="/" aria-label="Peter Tecnet — início">
        <span className="mkt-brand-mark"><img src="/petertecnet-brand.svg" alt="" /></span>
        <span><strong>Peter Tecnet</strong><small>Soluções em tecnologia</small></span>
      </a>
      <nav className="mkt-nav discovery-nav" aria-label="Navegação principal">
        <a href="/">Início</a>
        <a href="/#plataformas">Plataformas</a>
        <a href="/#catalogo">Catálogo</a>
        <a href="/blog" aria-current="page">Conteúdos</a>
        <a href="/#contato">Contato</a>
      </nav>
    </header>

    <main data-page-ready="blog-article">
      <article className="mkt-article discovery-article">
        <header className="mkt-article-header petrinia-story-header">
          <div className="mkt-grid" aria-hidden="true" />
          <div className="mkt-container">
            <div className="mkt-breadcrumb"><a href="/">Peter Tecnet</a><span>/</span><a href="/blog">Conteúdos</a><span>/</span><strong>Histórias de tecnologia</strong></div>
            <p className="mkt-kicker">HISTÓRIAS DE TECNOLOGIA</p>
            <h1>Petrínia e a Cutinapp: quando persistência transforma uma ideia em tecnologia</h1>
            <p className="mkt-article-deck">Uma ideia, um grande problema e a determinação de continuar até transformar dificuldade em progresso.</p>
            <div className="mkt-article-byline"><span>Peter Tecnet</span><i /><time dateTime="2026-09-04">04 de setembro de 2026</time></div>
          </div>
        </header>

        <div className="mkt-container petrinia-story-cover-wrap">
          <img className="petrinia-story-cover" src={COVER} alt="Petrínia e a Cutinapp: da dificuldade ao lançamento" width="1600" height="900" fetchPriority="high" />
        </div>

        <div className="mkt-container mkt-article-layout petrinia-story-layout">
          <aside className="mkt-article-aside">
            <strong>Neste conteúdo</strong>
            {sections.map(section => <a href={`#${section.id}`} key={section.id}>{section.title}</a>)}
          </aside>

          <div className="mkt-article-content">
            <p className="mkt-article-intro">Petrínia era uma garota cheia de energia, curiosidade e uma vontade enorme de criar alguma coisa que realmente fizesse diferença.</p>
            <p>Simpática, divertida e sempre disposta a ajudar, ela era daquele tipo de pessoa que conquistava todo mundo ao redor. Mas, por trás do sorriso fácil, existia uma cabeça que não parava. Petrínia gostava de observar problemas e imaginar maneiras melhores de resolvê-los.</p>

            {sections.map(section => <section id={section.id} key={section.id}>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph, index) => <p key={`${section.id}-${index}`}>{paragraph}</p>)}
            </section>)}

            <blockquote className="petrinia-story-quote">Tecnologia não é sobre nunca encontrar problemas. É sobre ter coragem suficiente para continuar quando eles aparecem.</blockquote>

            <aside className="discovery-context-cta petrinia-story-cta">
              <small>SOLUÇÃO RELACIONADA</small>
              <h3>Cutinapp</h3>
              <p>Eventos, ingressos digitais, descoberta de experiências e check-in por QR Code em uma jornada conectada.</p>
              <a className="mkt-btn is-primary" href="/plataformas/cutinapp">Conhecer a Cutinapp <span>↗</span></a>
            </aside>
          </div>
        </div>
      </article>
    </main>

    <footer className="mkt-footer">
      <div className="mkt-container discovery-footer">
        <strong>Peter Tecnet</strong>
        <span>Tecnologia para criar, integrar, organizar e crescer.</span>
        <a href="/blog">Mais conteúdos ↗</a>
      </div>
    </footer>
  </div>
}
