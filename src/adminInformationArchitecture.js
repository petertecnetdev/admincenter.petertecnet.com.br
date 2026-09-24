export const ADMIN_ENTITY_ROUTES = Object.freeze({
  users: '/usuarios',
  establishments: '/estabelecimentos',
})

const segment = value => encodeURIComponent(String(value ?? '').trim())

export const adminEntityRoute = Object.freeze({
  user: userId => `${ADMIN_ENTITY_ROUTES.users}/${segment(userId)}`,
  establishment: establishmentId => `${ADMIN_ENTITY_ROUTES.establishments}/${segment(establishmentId)}`,
  collaborators: establishmentId => `${ADMIN_ENTITY_ROUTES.establishments}/${segment(establishmentId)}/colaboradores`,
  items: establishmentId => `${ADMIN_ENTITY_ROUTES.establishments}/${segment(establishmentId)}/itens`,
  events: establishmentId => `${ADMIN_ENTITY_ROUTES.establishments}/${segment(establishmentId)}/eventos`,
  event: (establishmentId, eventId) => `${ADMIN_ENTITY_ROUTES.establishments}/${segment(establishmentId)}/eventos/${segment(eventId)}`,
  tickets: (establishmentId, eventId) => `${ADMIN_ENTITY_ROUTES.establishments}/${segment(establishmentId)}/eventos/${segment(eventId)}/ingressos`,
})

// A navegação principal deve permanecer curta e centrada nas duas entidades-raiz.
// Colaboradores, itens e eventos pertencem ao contexto do estabelecimento;
// ingressos pertencem ao contexto do evento e continuam acessíveis por deep link.
export const ADMIN_PRIMARY_NAVIGATION = Object.freeze([
  { key: 'users', label: 'Usuários', href: ADMIN_ENTITY_ROUTES.users },
  { key: 'establishments', label: 'Estabelecimentos', href: ADMIN_ENTITY_ROUTES.establishments },
])

// Mantém a entidade-raiz ativa durante toda a navegação contextual/deep link.
// Isso evita o menu perder seleção ao entrar em colaboradores, itens, eventos ou ingressos.
export const adminPrimaryNavigationKey = pathname => {
  const normalizedPath = `/${String(pathname ?? '').split('?')[0].split('#')[0].split('/').filter(Boolean).join('/')}`
  if (normalizedPath === ADMIN_ENTITY_ROUTES.users || normalizedPath.startsWith(`${ADMIN_ENTITY_ROUTES.users}/`)) return 'users'
  if (normalizedPath === ADMIN_ENTITY_ROUTES.establishments || normalizedPath.startsWith(`${ADMIN_ENTITY_ROUTES.establishments}/`)) return 'establishments'
  return null
}

export const adminEstablishmentNavigation = establishmentId => [
  { key: 'overview', label: 'Visão geral', href: adminEntityRoute.establishment(establishmentId) },
  { key: 'collaborators', label: 'Colaboradores', href: adminEntityRoute.collaborators(establishmentId) },
  { key: 'items', label: 'Itens', href: adminEntityRoute.items(establishmentId) },
  { key: 'events', label: 'Eventos', href: adminEntityRoute.events(establishmentId) },
]

export const adminEventNavigation = (establishmentId, eventId) => [
  { key: 'overview', label: 'Visão geral', href: adminEntityRoute.event(establishmentId, eventId) },
  { key: 'tickets', label: 'Ingressos', href: adminEntityRoute.tickets(establishmentId, eventId) },
]

export const adminBreadcrumbs = Object.freeze({
  users: () => [{ label: 'Usuários', href: ADMIN_ENTITY_ROUTES.users }],
  user: (userId, label = 'Usuário') => [
    ...adminBreadcrumbs.users(),
    { label, href: adminEntityRoute.user(userId) },
  ],
  establishments: () => [{ label: 'Estabelecimentos', href: ADMIN_ENTITY_ROUTES.establishments }],
  establishment: (establishmentId, label = 'Estabelecimento') => [
    { label: 'Estabelecimentos', href: ADMIN_ENTITY_ROUTES.establishments },
    { label, href: adminEntityRoute.establishment(establishmentId) },
  ],
  collaborators: (establishmentId, establishmentLabel = 'Estabelecimento') => [
    ...adminBreadcrumbs.establishment(establishmentId, establishmentLabel),
    { label: 'Colaboradores', href: adminEntityRoute.collaborators(establishmentId) },
  ],
  items: (establishmentId, establishmentLabel = 'Estabelecimento') => [
    ...adminBreadcrumbs.establishment(establishmentId, establishmentLabel),
    { label: 'Itens', href: adminEntityRoute.items(establishmentId) },
  ],
  events: (establishmentId, establishmentLabel = 'Estabelecimento') => [
    ...adminBreadcrumbs.establishment(establishmentId, establishmentLabel),
    { label: 'Eventos', href: adminEntityRoute.events(establishmentId) },
  ],
  event: (establishmentId, eventId, establishmentLabel = 'Estabelecimento', eventLabel = 'Evento') => [
    ...adminBreadcrumbs.events(establishmentId, establishmentLabel),
    { label: eventLabel, href: adminEntityRoute.event(establishmentId, eventId) },
  ],
  tickets: (establishmentId, eventId, establishmentLabel = 'Estabelecimento', eventLabel = 'Evento') => [
    ...adminBreadcrumbs.event(establishmentId, eventId, establishmentLabel, eventLabel),
    { label: 'Ingressos', href: adminEntityRoute.tickets(establishmentId, eventId) },
  ],
})
