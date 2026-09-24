import { useEffect, useMemo, useState } from 'react'
import './PwaInstallButton.css'

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function isMobileDevice() {
  return window.matchMedia?.('(max-width: 900px), (pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function isIos() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export default function PwaInstallButton() {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [installed, setInstalled] = useState(() => isStandalone())
  const [mobile, setMobile] = useState(() => isMobileDevice())
  const [helpOpen, setHelpOpen] = useState(false)
  const [installing, setInstalling] = useState(false)

  const ios = useMemo(() => isIos(), [])

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js', { scope: '/', updateViaCache: 'none' })
        .then(registration => registration.update())
        .catch(error => {
          console.error('[Admin Center PWA] Falha ao registrar service worker:', error)
        })
    }

    const media = window.matchMedia?.('(max-width: 900px), (pointer: coarse)')
    const displayMode = window.matchMedia?.('(display-mode: standalone)')

    const refreshMobile = () => setMobile(isMobileDevice())
    const refreshInstalled = () => setInstalled(isStandalone())

    const onBeforeInstallPrompt = event => {
      event.preventDefault()
      setInstallPrompt(event)
      setInstalled(false)
    }

    const onInstalled = () => {
      setInstalled(true)
      setInstallPrompt(null)
      setHelpOpen(false)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    window.addEventListener('resize', refreshMobile)
    displayMode?.addEventListener?.('change', refreshInstalled)
    media?.addEventListener?.('change', refreshMobile)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      window.removeEventListener('resize', refreshMobile)
      displayMode?.removeEventListener?.('change', refreshInstalled)
      media?.removeEventListener?.('change', refreshMobile)
    }
  }, [])

  async function install() {
    if (installing) return

    if (!installPrompt) {
      setHelpOpen(value => !value)
      return
    }

    setInstalling(true)
    try {
      const openInstallDialog = installPrompt['prompt']
      if (typeof openInstallDialog === 'function') {
        await openInstallDialog.call(installPrompt)
      }
      const choice = await installPrompt.userChoice
      if (choice?.outcome === 'accepted') {
        setInstallPrompt(null)
        setHelpOpen(false)
      }
    } finally {
      setInstalling(false)
    }
  }

  if (!mobile || installed) return null

  return (
    <div className="admin-pwa-install">
      <button
        type="button"
        className="admin-pwa-install__button"
        onClick={install}
        disabled={installing}
        aria-expanded={helpOpen}
        aria-controls="admin-pwa-install-help"
      >
        <span className="admin-pwa-install__icon" aria-hidden="true">⇩</span>
        <span>{installing ? 'Abrindo instalação…' : 'Instalar aplicativo'}</span>
      </button>

      {helpOpen && !installPrompt && (
        <div id="admin-pwa-install-help" className="admin-pwa-install__help" role="status">
          <button type="button" className="admin-pwa-install__close" onClick={() => setHelpOpen(false)} aria-label="Fechar">×</button>
          <strong>Instale o Admin Center no celular</strong>
          {ios ? (
            <p>No Safari, toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.</p>
          ) : (
            <p>No navegador, abra o menu <b>⋮</b> e escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</p>
          )}
        </div>
      )}
    </div>
  )
}
