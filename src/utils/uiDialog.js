import './uiDialog.css'

const queue = []
let active = false
let sequence = 0
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined && text !== null) node.textContent = String(text)
  return node
}

function unlockBody(previousOverflow) {
  document.body.style.overflow = previousOverflow
}

function runNext() {
  if (active || !queue.length || typeof document === 'undefined') return
  active = true

  const { options, resolve } = queue.shift()
  const previousOverflow = document.body.style.overflow
  const previousFocus = document.activeElement
  document.body.style.overflow = 'hidden'

  const id = `pt-ui-dialog-${++sequence}`
  const backdrop = element('div', `pt-ui-dialog-backdrop tone-${options.tone}`)
  const panel = element('section', 'pt-ui-dialog-panel')
  panel.tabIndex = -1
  const heading = element('div', 'pt-ui-dialog-heading')
  const icon = element('span', 'pt-ui-dialog-icon', options.icon || (options.tone === 'danger' ? '!' : options.tone === 'success' ? '✓' : 'i'))
  icon.setAttribute('aria-hidden', 'true')
  const copy = element('div', 'pt-ui-dialog-copy')
  const eyebrow = element('span', 'pt-ui-dialog-eyebrow', options.eyebrow || (options.tone === 'danger' ? 'AÇÃO SENSÍVEL' : 'PETER TECNET'))
  const title = element('h2', '', options.title || 'Confirmar ação')
  title.id = `${id}-title`
  copy.append(eyebrow, title)
  heading.append(icon, copy)
  panel.append(heading)

  panel.setAttribute('role', options.tone === 'danger' ? 'alertdialog' : 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-labelledby', title.id)

  if (options.message) {
    const message = element('p', 'pt-ui-dialog-message', options.message)
    message.id = `${id}-description`
    panel.setAttribute('aria-describedby', message.id)
    panel.append(message)
  }

  let verificationInput = null
  if (options.requiredText) {
    const field = element('label', 'pt-ui-dialog-field')
    const label = element('span', '', options.requiredTextLabel || 'Digite a frase abaixo para confirmar')
    const phrase = element('code', 'pt-ui-dialog-required-text', options.requiredText)
    verificationInput = element('input', 'pt-ui-dialog-input')
    verificationInput.type = 'text'
    verificationInput.autocomplete = 'off'
    verificationInput.spellcheck = false
    verificationInput.placeholder = options.requiredTextPlaceholder || options.requiredText
    field.append(label, phrase, verificationInput)
    panel.append(field)
  }

  if (options.textValue !== undefined && options.textValue !== null) {
    const field = element('label', 'pt-ui-dialog-field')
    field.append(element('span', '', options.textLabel || 'Conteúdo'))
    const textarea = element('textarea', 'pt-ui-dialog-textarea')
    textarea.readOnly = true
    textarea.rows = options.textRows || 10
    textarea.value = String(options.textValue)
    textarea.addEventListener('focus', () => textarea.select())
    field.append(textarea)
    panel.append(field)
  }

  const actions = element('footer', 'pt-ui-dialog-actions')
  const cancelButton = options.showCancel === false ? null : element('button', 'pt-ui-dialog-button secondary', options.cancelLabel || 'Cancelar')
  const confirmButton = element('button', `pt-ui-dialog-button ${options.tone === 'danger' ? 'danger' : 'primary'}`, options.confirmLabel || 'Confirmar')
  confirmButton.type = 'button'
  if (cancelButton) {
    cancelButton.type = 'button'
    actions.append(cancelButton)
  }
  actions.append(confirmButton)
  panel.append(actions)
  backdrop.append(panel)
  document.body.append(backdrop)

  function isVerified() {
    return !options.requiredText || verificationInput?.value.trim() === String(options.requiredText)
  }

  function syncConfirmState() {
    confirmButton.disabled = !isVerified()
  }

  function focusableNodes() {
    return [...panel.querySelectorAll(FOCUSABLE)].filter(node => node instanceof HTMLElement && !node.hidden && node.getAttribute('aria-hidden') !== 'true')
  }

  let finished = false
  function finish(confirmed) {
    if (finished) return
    finished = true
    document.removeEventListener('keydown', onKeyDown)
    backdrop.remove()
    unlockBody(previousOverflow)
    if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) {
      window.requestAnimationFrame(() => previousFocus.focus())
    }
    active = false
    resolve({ confirmed, value: verificationInput?.value || '' })
    queueMicrotask(runNext)
  }

  function onKeyDown(event) {
    if (event.key === 'Escape' && options.showCancel !== false) {
      event.preventDefault()
      finish(false)
      return
    }
    if (event.key !== 'Tab') return
    const nodes = focusableNodes()
    if (!nodes.length) {
      event.preventDefault()
      panel.focus()
      return
    }
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  cancelButton?.addEventListener('click', () => finish(false))
  confirmButton.addEventListener('click', () => { if (isVerified()) finish(true) })
  verificationInput?.addEventListener('input', syncConfirmState)
  backdrop.addEventListener('mousedown', event => {
    if (event.target === backdrop && options.dismissOnBackdrop !== false && options.showCancel !== false) finish(false)
  })
  document.addEventListener('keydown', onKeyDown)

  syncConfirmState()
  window.requestAnimationFrame(() => {
    verificationInput ? verificationInput.focus() : confirmButton.focus()
  })
}

export function openUiDialog(options = {}) {
  if (typeof document === 'undefined') return Promise.resolve({ confirmed: false, value: '' })
  return new Promise(resolve => {
    queue.push({ options: { tone: 'neutral', dismissOnBackdrop: true, ...options }, resolve })
    runNext()
  })
}

export async function confirmAction(options = {}) {
  const result = await openUiDialog({ showCancel: true, ...options })
  return result.confirmed
}

export async function confirmTypedAction(options = {}) {
  const result = await openUiDialog({ showCancel: true, ...options })
  return result.confirmed
}

export function showNotice(options = {}) {
  return openUiDialog({ showCancel: false, confirmLabel: 'Entendi', ...options })
}

export function showTextDialog(options = {}) {
  return openUiDialog({ showCancel: false, confirmLabel: 'Fechar', ...options })
}
