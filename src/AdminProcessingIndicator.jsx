export default function AdminProcessingIndicator({
  title = 'Carregando conteúdo',
  messages = 'Processando sua solicitação…|Sincronizando informações com a API central…|Quase lá — organizando os últimos detalhes…',
  detail = '',
  className = '',
  screen = false,
}) {
  return <div className={className || undefined} role="status" aria-live="polite" aria-busy="true">
    <pt-processing-indicator
      compact={screen ? undefined : 'true'}
      screen={screen ? 'true' : undefined}
      title={title}
      messages={messages}
      progress-detail={detail || undefined}
    ></pt-processing-indicator>
  </div>
}
