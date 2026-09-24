export const marketingServices = [
  {
    slug: 'desenvolvimento-de-software',
    eyebrow: 'Software sob medida',
    title: 'Desenvolvimento de software e sistemas',
    short: 'Sistemas web, painéis administrativos, portais e ferramentas internas criadas para a rotina da empresa.',
    description: 'Projetamos e desenvolvemos software de acordo com o problema que precisa ser resolvido, conectando interface, regras de negócio, banco de dados, integrações e operação.',
    icon: '01',
    intents: ['sistema sob medida', 'painel administrativo', 'software empresarial', 'portal web'],
    deliverables: ['Descoberta e definição do escopo', 'Interface responsiva', 'Backend e banco de dados', 'Integrações necessárias', 'Publicação e evolução'],
    related: ['api-e-integracoes', 'banco-de-dados', 'inteligencia-artificial-e-automacao'],
  },
  {
    slug: 'criacao-de-sites',
    eyebrow: 'Presença digital',
    title: 'Criação de sites e páginas institucionais',
    short: 'Sites modernos, responsivos e preparados para apresentar empresas, serviços e projetos.',
    description: 'Criamos sites com boa experiência no celular e desktop, estrutura clara de conteúdo, desempenho e recursos necessários para transformar visitas em contato.',
    icon: '02',
    intents: ['criação de site', 'site para empresa', 'site profissional', 'site responsivo'],
    deliverables: ['Arquitetura de conteúdo', 'Design responsivo', 'Formulários e contatos', 'SEO técnico', 'Publicação'],
    related: ['landing-pages', 'e-commerce', 'desenvolvimento-de-software'],
  },
  {
    slug: 'landing-pages',
    eyebrow: 'Conversão',
    title: 'Landing pages para campanhas, produtos e serviços',
    short: 'Páginas focadas em apresentar uma oferta e conduzir o visitante para uma ação.',
    description: 'Desenvolvemos landing pages para lançamentos, campanhas, serviços, captação de leads e validação de ideias, com conteúdo direto e experiência pensada para conversão.',
    icon: '03',
    intents: ['landing page', 'página de vendas', 'página para campanha', 'captar leads'],
    deliverables: ['Estrutura da oferta', 'Design focado em conversão', 'Formulário ou CTA', 'Medição de eventos', 'Publicação'],
    related: ['criacao-de-sites', 'e-commerce', 'inteligencia-artificial-e-automacao'],
  },
  {
    slug: 'aplicativos',
    eyebrow: 'Produtos digitais',
    title: 'Aplicativos e plataformas digitais',
    short: 'Aplicações para atendimento, vendas, gestão, agenda, eventos e novos modelos de negócio.',
    description: 'Criamos experiências digitais para usuários e equipes, integrando autenticação, dados, pagamentos, notificações e processos específicos do produto.',
    icon: '04',
    intents: ['criar aplicativo', 'aplicativo para empresa', 'plataforma digital', 'app web'],
    deliverables: ['Fluxos do usuário', 'Aplicação responsiva', 'Contas e permissões', 'Integrações e dados', 'Operação em produção'],
    related: ['desenvolvimento-de-software', 'api-e-integracoes', 'banco-de-dados'],
  },
  {
    slug: 'e-commerce',
    eyebrow: 'Vendas online',
    title: 'E-commerce e experiências de compra',
    short: 'Lojas e fluxos digitais para apresentar produtos, receber pedidos e integrar pagamentos.',
    description: 'Estruturamos a jornada de compra, catálogo, carrinho, checkout e integrações necessárias para uma operação de venda online.',
    icon: '05',
    intents: ['loja virtual', 'e-commerce', 'vender pela internet', 'checkout online'],
    deliverables: ['Catálogo e categorias', 'Carrinho e checkout', 'Meios de pagamento', 'Gestão de pedidos', 'Integrações'],
    related: ['criacao-de-sites', 'api-e-integracoes', 'inteligencia-artificial-e-automacao'],
  },
  {
    slug: 'inteligencia-artificial-e-automacao',
    eyebrow: 'IA e automação',
    title: 'Inteligência artificial e automações',
    short: 'Automação de tarefas, atendimento, classificação, geração de conteúdo e fluxos operacionais.',
    description: 'Aplicamos automação e inteligência artificial quando elas reduzem trabalho repetitivo, aceleram decisões ou tornam uma operação mais eficiente.',
    icon: '06',
    intents: ['automação de processos', 'inteligência artificial', 'chatbot', 'automatizar atendimento'],
    deliverables: ['Mapeamento do processo', 'Integração com ferramentas', 'Regras e automações', 'IA quando aplicável', 'Medição e ajustes'],
    related: ['api-e-integracoes', 'desenvolvimento-de-software', 'banco-de-dados'],
  },
  {
    slug: 'api-e-integracoes',
    eyebrow: 'Conexões',
    title: 'APIs e integrações entre sistemas',
    short: 'Conectamos ferramentas e dados para reduzir trabalho manual e evitar informações isoladas.',
    description: 'Criamos e integramos APIs, webhooks e serviços para que sistemas diferentes consigam trocar dados com segurança e previsibilidade.',
    icon: '07',
    intents: ['criar API', 'integrar sistemas', 'webhook', 'integração de software'],
    deliverables: ['Mapeamento de dados', 'Contrato de integração', 'API ou conector', 'Autenticação e segurança', 'Monitoramento'],
    related: ['banco-de-dados', 'desenvolvimento-de-software', 'inteligencia-artificial-e-automacao'],
  },
  {
    slug: 'banco-de-dados',
    eyebrow: 'Dados',
    title: 'Banco de dados e organização da informação',
    short: 'Modelagem, organização e evolução de dados para sistemas e operações digitais.',
    description: 'Estruturamos bancos de dados, relacionamentos, consultas e processos de migração para manter informações organizadas, confiáveis e prontas para crescer.',
    icon: '08',
    intents: ['banco de dados', 'modelagem de dados', 'migrar dados', 'organizar dados'],
    deliverables: ['Modelagem', 'Estrutura de tabelas e relações', 'Migração quando necessária', 'Consultas e índices', 'Rotinas de segurança'],
    related: ['api-e-integracoes', 'desenvolvimento-de-software', 'inteligencia-artificial-e-automacao'],
  },
  {
    slug: 'documentos-e-servicos-digitais',
    eyebrow: 'Serviços digitais',
    title: 'Documentos, contratos e demandas digitais',
    short: 'Serviços digitais práticos para necessidades que não exigem o desenvolvimento de um sistema completo.',
    description: 'Atendemos demandas como formatação de textos, organização de documentos, contratos, apoio em serviços online e outras tarefas digitais que podem ser resolvidas com agilidade.',
    icon: '09',
    intents: ['formatar documento', 'contrato de serviço', 'contrato de aluguel', 'serviço digital'],
    deliverables: ['Entendimento da necessidade', 'Preparação do documento ou serviço', 'Revisão das informações', 'Entrega digital', 'Ajustes combinados'],
    related: ['criacao-de-sites', 'inteligencia-artificial-e-automacao'],
  },
]

export const catalogGroups = [
  { id: 'software', label: 'Software e sistemas', keywords: ['software', 'sistema', 'programa', 'painel', 'dashboard', 'desenvolvimento'] },
  { id: 'sites', label: 'Sites e presença digital', keywords: ['site', 'website', 'landing', 'página', 'pagina', 'e-commerce', 'ecommerce', 'loja'] },
  { id: 'apps', label: 'Aplicativos e plataformas', keywords: ['aplicativo', 'app', 'plataforma', 'portal'] },
  { id: 'ia', label: 'IA, automação e integrações', keywords: ['ia', 'inteligência', 'inteligencia', 'automação', 'automacao', 'api', 'integração', 'integracao', 'banco de dados'] },
  { id: 'digital', label: 'Documentos e serviços digitais', keywords: ['documento', 'contrato', 'formatação', 'formatacao', 'boleto', 'guia', 'ipva', 'digital'] },
  { id: 'outros', label: 'Outros produtos e serviços', keywords: [] },
]

export const trustPoints = [
  { title: 'Empresa identificada', text: 'CNPJ, contato e canais oficiais disponíveis para quem chega pela primeira vez.' },
  { title: 'Projetos em produção', text: 'O portfólio inclui plataformas próprias desenvolvidas e mantidas pela Peter Tecnet.' },
  { title: 'Do simples ao avançado', text: 'Atendimento para uma demanda digital pontual ou para um produto completo.' },
  { title: 'Evolução contínua', text: 'Projetos podem crescer por etapas, com novas integrações e funcionalidades conforme a necessidade.' },
]

export const caseBlueprints = {
  nexus: {
    problem: 'Empresas precisam divulgar produtos e serviços de forma simples e permitir que clientes encontrem o catálogo.',
    solution: 'Catálogo digital, empresas, itens, busca, QR Codes e jornada de compra conectada.',
    result: 'Uma base reutilizável para descoberta e comércio digital dentro do ecossistema Peter Tecnet.',
  },
  rasoio: {
    problem: 'Prestadores de serviço precisam organizar horários, profissionais, recursos e reservas.',
    solution: 'Plataforma de agendamento para diferentes tipos de estabelecimentos e serviços.',
    result: 'Agenda digital preparada para múltiplos segmentos, profissionais e regras de disponibilidade.',
  },
  cutinapp: {
    problem: 'Produtores precisam divulgar eventos, vender ingressos e controlar entrada de participantes.',
    solution: 'Eventos, ingressos, promoters, participantes, cortesias e check-in por QR Code.',
    result: 'Operação de evento integrada do cadastro até o acesso do participante.',
  },
  payflow: {
    problem: 'Pequenas operações comerciais perdem oportunidades por falta de acompanhamento do atendimento até o pagamento.',
    solution: 'CRM com contatos, oportunidades, propostas, cobranças e acompanhamento do pipeline.',
    result: 'Visão organizada da jornada comercial e das próximas ações necessárias.',
  },
  laora: {
    problem: 'Aplicativos de relacionamento podem gerar frustração quando escondem informações essenciais sobre conexões.',
    solution: 'Experiência de descoberta, matches, conversas, privacidade, bloqueios e moderação.',
    result: 'Base de relacionamento digital com foco em transparência e segurança operacional.',
  },
}

export const aboutFacts = [
  'Desenvolvimento de produtos e serviços digitais',
  'Aplicativos e plataformas próprias',
  'Projetos sob medida para empresas e pessoas',
  'Integrações, automações e inteligência artificial',
  'Serviços digitais simples quando um software completo não é necessário',
]

export function serviceBySlug(slug) {
  return marketingServices.find(service => service.slug === slug)
}

export function groupCatalogItem(item) {
  const text = `${item?.name || ''} ${item?.description || ''} ${item?.category || ''} ${item?.subcategory || ''} ${item?.brand || ''}`.toLocaleLowerCase('pt-BR')
  return catalogGroups.find(group => group.keywords.some(keyword => text.includes(keyword)))?.id || 'outros'
}
