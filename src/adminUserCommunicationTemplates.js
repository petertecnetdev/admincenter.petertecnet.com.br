const CUTINAPP_SLUG = 'cutinapp'

export const COMMUNICATION_TEMPLATES = [
  {
    key: 'custom',
    label: 'Mensagem livre',
    subject: '',
    message: '',
    type: 'info',
    app: null,
    actions: [],
  },
  {
    key: 'information',
    label: 'Informação',
    subject: 'Informação importante',
    message: '',
    type: 'info',
    app: null,
    actions: [],
  },
  {
    key: 'password_change',
    label: 'Troca de senha',
    subject: 'Altere sua senha com segurança na Cutinapp',
    type: 'info',
    app: CUTINAPP_SLUG,
    message: 'Acesse a Cutinapp pelo botão abaixo para alterar sua senha em uma área segura. Se você não solicitou esta orientação, não compartilhe sua senha ou códigos de acesso com ninguém.',
    actions: [{ label: 'Alterar minha senha', path: '/password' }],
  },
  {
    key: 'event_creation',
    label: 'Criar evento',
    subject: 'Sua produção está pronta para receber novos eventos',
    type: 'success',
    app: CUTINAPP_SLUG,
    message: 'Sua produção já está preparada na Cutinapp. Agora você pode criar o próximo evento, configurar os ingressos, revisar as informações e publicar quando estiver tudo pronto.',
    actions: [
      { label: 'Criar novo evento', path: '/event/create' },
      { label: 'Gerenciar meus eventos', path: '/event/manage' },
    ],
  },
  {
    key: 'production_completed',
    label: 'Produção concluída',
    subject: 'Parabéns! Sua produção está pronta na Cutinapp',
    type: 'success',
    app: CUTINAPP_SLUG,
    requiresProduction: true,
    includeEvents: true,
    message: 'Concluímos a configuração da sua produção na Cutinapp. Parabéns por esta etapa! Alguns dos eventos já cadastrados e vinculados à sua conta aparecem logo abaixo para você revisar. Você já pode entrar na Cutinapp, conferir as páginas e continuar preparando suas próximas publicações.',
    actions: [
      { label: 'Gerenciar meus eventos', path: '/event/manage' },
      { label: 'Criar novo evento', path: '/event/create' },
    ],
  },
]

function absoluteUrl(application, path) {
  const base = String(application?.url || '').replace(/\/$/, '')
  return base && path ? `${base}${path}` : ''
}

export function templatesForApplication(appSlug) {
  return COMMUNICATION_TEMPLATES.filter(template => !template.app || template.app === appSlug)
}

export function applyCommunicationTemplate(template, application, production = null) {
  const actions = (template.actions || []).map(action => ({
    label: action.label,
    url: absoluteUrl(application, action.path),
  })).filter(action => action.url)

  if (template.key === 'production_completed' && production?.slug && application?.url) {
    actions.unshift({
      label: 'Ver minha produção',
      url: absoluteUrl(application, `/production/${encodeURIComponent(production.slug)}/public`),
    })
  }

  return {
    template_key: template.key,
    subject: template.subject || '',
    message: template.message || '',
    type: template.type || 'info',
    include_events: Boolean(template.includeEvents),
    actions: actions.slice(0, 3),
  }
}
