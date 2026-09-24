export default function AdminProcessingIndicator({
  title = 'Carregando conteúdo',
  messages = 'Processando sua solicitação…|Sincronizando informações com a API central…|Quase lá — organizando os últimos detalhes…',
  detail = '',
  className = '',
  screen = false,
}) {
  const accessibleStatus = detail ? `${title}. ${detail}` : title

  return <div
    className={className || undefined}
    role="status"
    aria-live="polite"
    aria-atomic="true"
    aria-busy="true"
    aria-label={accessibleStatus}
  >
    <pt-processing-indicator
      compact={screen ? undefined : 'true'}
      screen={screen ? 'true' : undefined}
      title={title}
      messages={messages}
      progress-detail={detail || undefined}
      aria-hidden="true"
    ></pt-processing-indicator>
  </div>
}
