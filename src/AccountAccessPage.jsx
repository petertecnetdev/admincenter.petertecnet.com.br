import { useEffect, useMemo, useState } from 'react'
import { ADMIN_API_BASE } from './adminApi.js'
import { showNotice } from './utils/uiDialog.js'
import './AccountAccessPage.css'

const API = ADMIN_API_BASE

const FALLBACK_VALIDATION_MESSAGES = {
  'validation.password.letters': 'A senha deve conter pelo menos uma letra.',
  'validation.password.mixed': 'A senha deve conter pelo menos uma letra maiúscula e uma letra minúscula.',
  'validation.password.numbers': 'A senha deve conter pelo menos um número.',
  'validation.password.symbols': 'A senha deve conter pelo menos um símbolo, como @, #, ! ou $.',
  'validation.password.uncompromised': 'Esta senha apareceu em vazamentos conhecidos. Escolha outra senha.',
  'validation.confirmed': 'A confirmação da senha não confere.',
}

function humanMessage(value, fallback = 'Não foi possível concluir a operação.') {
  const message = String(value || '').trim()
  if (!message) return fallback
  return FALLBACK_VALIDATION_MESSAGES[message] || (message.startsWith('validation.') ? fallback : message)
}

function passwordValidationMessage(password) {
  if (password.length < 8) return 'A senha deve ter pelo menos 8 caracteres.'
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return 'A senha deve conter pelo menos uma letra maiúscula e uma letra minúscula.'
  }
  if (!/[0-9]/.test(password)) return 'A senha deve conter pelo menos um número.'
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'A senha deve conter pelo menos um símbolo, como @, #, ! ou $.'
  }
  return ''
}

function showAlert({ icon = 'error', title, text, confirmButtonText = 'Entendi' }) {
  const tone = icon === 'success' ? 'success' : icon === 'warning' ? 'warning' : icon === 'error' ? 'danger' : 'neutral'
  return showNotice({
    tone,
    title,
    message: text,
    confirmLabel: confirmButtonText,
  })
}

function showErrorAlert(title, error, fallback) {
  const text = humanMessage(error instanceof Error ? error.message : error, fallback)
  return showAlert({ icon: 'error', title, text })
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const validation = Object.values(data?.errors || {})
      .flat()
      .filter(Boolean)
      .map((message) => humanMessage(message))

    const message = validation[0]
      || humanMessage(data?.message || data?.error, 'Não foi possível concluir a operação.')

    const error = new Error(message)
    error.status = response.status
    error.validationMessages = validation
    throw error
  }

  return data
}

function safeAppUrl(raw) {
  try {
    const url = new URL(raw)
    const host = url.hostname.toLowerCase()
    if (url.protocol !== 'https:') return 'https://petertecnet.com.br'
    if (host === 'petertecnet.com.br' || host.endsWith('.petertecnet.com.br')) {
      return url.toString()
    }
  } catch {
    // fallback below
  }
  return 'https://petertecnet.com.br'
}

function AccountShell({ eyebrow, title, description, children }) {
  return (
    <main className="account-access-page">
      <section className="account-access-card">
        <header className="account-access-brand">
          <img src="/petertecnet-brand.svg" alt="Peter Tecnet" />
          <div>
            <strong>Peter Tecnet</strong>
            <span>Conta do ecossistema</span>
          </div>
        </header>

        <div className="account-access-heading">
          <span className="account-access-eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>

        {children}
      </section>
    </main>
  )
}

function Field({ label, children, hint }) {
  return (
    <label className="account-access-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

function ActivationPage() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') || '', [])
  const [invitation, setInvitation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fatalError, setFatalError] = useState('')
