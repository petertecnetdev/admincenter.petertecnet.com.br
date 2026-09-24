import { useEffect, useMemo, useState } from 'react'
import { showNotice } from './utils/uiDialog.js'
import './AccountAccessPage.css'

const API = 'https://api.petertecnet.com.br/api'

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
  const [submitting, setSubmitting] = useState(false)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [activatedApplication, setActivatedApplication] = useState(null)

  useEffect(() => {
    document.title = 'Ativar conta | Peter Tecnet'

    if (!token) {
      const message = 'Este link de ativação não possui um token válido. Solicite um novo convite.'
      setFatalError(message)
      setLoading(false)
      void showErrorAlert('Link de ativação inválido', message)
      return
    }

    let active = true
    apiRequest(`/auth/invitations/${encodeURIComponent(token)}`)
      .then((data) => {
        if (active) setInvitation(data)
      })
      .catch((err) => {
        if (!active) return
        const message = humanMessage(err.message, 'Não foi possível validar este convite.')
        setFatalError(message)
        void showErrorAlert('Não foi possível abrir o convite', message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [token])

  async function submit(event) {
    event.preventDefault()

    const normalizedCode = code.trim().toUpperCase()
    if (!normalizedCode) {
      await showErrorAlert('Código obrigatório', 'Digite o código de verificação recebido por e-mail.')
      return
    }

    const passwordError = passwordValidationMessage(password)
    if (passwordError) {
      await showErrorAlert('Senha fora do padrão', passwordError)
      return
    }

    if (password !== confirmation) {
      await showErrorAlert('As senhas não coincidem', 'Digite a mesma senha nos campos “Nova senha” e “Confirmar nova senha”.')
      return
    }

    setSubmitting(true)
    try {
      const result = await apiRequest(`/auth/invitations/${encodeURIComponent(token)}/activate`, {
        method: 'POST',
        body: JSON.stringify({
          verification_code: normalizedCode,
          password,
          password_confirmation: confirmation,
        }),
      })

      setActivatedApplication(result.application)
      await showAlert({
        icon: 'success',
        title: 'Conta ativada com sucesso',
        text: `Seu e-mail foi validado e sua senha foi criada. O acesso ao ${result?.application?.name || 'aplicativo'} está liberado.`,
        confirmButtonText: 'Continuar',
      })
    } catch (err) {
      await showErrorAlert(
        'Não foi possível ativar sua conta',
        err,
        'Confira o código e os requisitos da senha e tente novamente.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (activatedApplication) {
    return (
      <AccountShell
        eyebrow="Acesso liberado"
        title="Conta ativada com sucesso"
        description="Seu e-mail foi validado e sua nova senha já está valendo."
      >
        <div className="account-access-success">
          <div className="account-access-success-icon">✓</div>
          <p>
            O acesso ao <strong>{activatedApplication.name}</strong> está pronto.
          </p>
          <a className="account-access-primary" href={safeAppUrl(activatedApplication.url)}>
            Acessar {activatedApplication.name}
          </a>
        </div>
      </AccountShell>
    )
  }

  return (
    <AccountShell
      eyebrow="Primeiro acesso"
      title="Ative sua conta"
      description={invitation?.application?.name
        ? `Valide seu e-mail e crie sua senha para acessar ${invitation.application.name}.`
        : 'Valide seu e-mail e crie sua senha para acessar o ecossistema Peter Tecnet.'}
    >
      {loading ? (
        <div className="account-access-status">Validando o convite...</div>
      ) : invitation ? (
        <form className="account-access-form" onSubmit={submit} noValidate>
          <Field label="E-mail">
            <input type="email" value={invitation.email || ''} readOnly />
          </Field>

          <Field label="Código de verificação" hint="Digite o código que foi enviado no mesmo e-mail do convite.">
            <input
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              autoComplete="one-time-code"
              maxLength={12}
              required
              className="account-access-code"
              placeholder="Ex.: A7K9P2QX"
            />
          </Field>

          <Field label="Nova senha">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>

          <Field
            label="Confirmar nova senha"
            hint="Use pelo menos 8 caracteres, com maiúscula, minúscula, número e símbolo."
          >
            <input
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>

          <button className="account-access-primary" type="submit" disabled={submitting}>
            {submitting ? 'Validando e salvando...' : 'Validar e criar minha senha'}
          </button>
        </form>
      ) : (
        <div className="account-access-error account-access-error-static">{fatalError}</div>
      )}

      <div className="account-access-footer-link">
        Já possui uma conta? <a href="/account/password/reset">Redefinir minha senha</a>
      </div>
    </AccountShell>
  )
}

function PasswordResetPage() {
  const initialEmail = useMemo(() => new URLSearchParams(window.location.search).get('email') || '', [])
  const [email, setEmail] = useState(initialEmail)
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    document.title = 'Redefinir senha | Peter Tecnet'
  }, [])

  async function requestCode(event) {
    event.preventDefault()
    setMessage('')

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      await showErrorAlert('E-mail obrigatório', 'Informe o e-mail da sua conta.')
      return
    }

    setLoading(true)
    try {
      const result = await apiRequest('/auth/password-email', {
        method: 'POST',
        body: JSON.stringify({ email: normalizedEmail }),
      })
      const successMessage = result.message || 'Se o e-mail estiver cadastrado, o código foi enviado.'
      setCodeSent(true)
      setMessage(successMessage)
      await showAlert({
        icon: 'success',
        title: 'Código solicitado',
        text: successMessage,
        confirmButtonText: 'Continuar',
      })
    } catch (err) {
      await showErrorAlert('Não foi possível enviar o código', err)
    } finally {
      setLoading(false)
    }
  }

  async function resetPassword(event) {
    event.preventDefault()
    setMessage('')

    const normalizedCode = code.trim().toUpperCase()
    if (!normalizedCode) {
      await showErrorAlert('Código obrigatório', 'Digite o código de redefinição enviado para seu e-mail.')
      return
    }

    const passwordError = passwordValidationMessage(password)
    if (passwordError) {
      await showErrorAlert('Senha fora do padrão', passwordError)
      return
    }

    if (password !== confirmation) {
      await showErrorAlert('As senhas não coincidem', 'Digite a mesma senha nos dois campos de senha.')
      return
    }

    setLoading(true)
    try {
      const result = await apiRequest('/auth/password-reset', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          reset_password_code: normalizedCode,
          password,
        }),
      })
      const successMessage = result.message || 'Senha redefinida com sucesso.'
      setMessage(successMessage)
      setDone(true)
      await showAlert({
        icon: 'success',
        title: 'Senha alterada',
        text: successMessage,
        confirmButtonText: 'Ok',
      })
    } catch (err) {
      await showErrorAlert(
        'Não foi possível alterar sua senha',
        err,
        'Confira o código e os requisitos da nova senha.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <AccountShell
      eyebrow="Segurança da conta"
      title="Redefinir sua senha"
      description="Solicite um código no seu e-mail e escolha uma nova senha para sua conta Peter Tecnet."
    >
      {done ? (
        <div className="account-access-success">
          <div className="account-access-success-icon">✓</div>
          <p>{message}</p>
          <a className="account-access-primary" href="/">Voltar para Peter Tecnet</a>
        </div>
      ) : !codeSent ? (
        <form className="account-access-form" onSubmit={requestCode} noValidate>
          <Field label="E-mail da conta">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              placeholder="voce@exemplo.com"
            />
          </Field>

          <button className="account-access-primary" type="submit" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar código de redefinição'}
          </button>
        </form>
      ) : (
        <form className="account-access-form" onSubmit={resetPassword} noValidate>
          <Field label="E-mail">
            <input type="email" value={email} readOnly />
          </Field>

          <Field label="Código de redefinição">
            <input
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              autoComplete="one-time-code"
              maxLength={16}
              required
              className="account-access-code"
            />
          </Field>

          <Field label="Nova senha">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>

          <Field
            label="Confirmar nova senha"
            hint="Use pelo menos 8 caracteres, com maiúscula, minúscula, número e símbolo."
          >
            <input
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>

          <button className="account-access-primary" type="submit" disabled={loading}>
            {loading ? 'Alterando senha...' : 'Validar código e alterar senha'}
          </button>

          <button
            className="account-access-secondary"
            type="button"
            onClick={() => {
              setCodeSent(false)
              setCode('')
              setMessage('')
            }}
          >
            Usar outro e-mail
          </button>
        </form>
      )}

      <div className="account-access-footer-link">
        Recebeu um convite? Use o botão de ativação que chegou no seu e-mail.
      </div>
    </AccountShell>
  )
}

export default function AccountAccessPage() {
  if (window.location.pathname.replace(/\/+$/, '') === '/account/password/reset') {
    return <PasswordResetPage />
  }

  return <ActivationPage />
}
