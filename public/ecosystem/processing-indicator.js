(() => {
  const TAG = 'pt-processing-indicator'
  const OFFICIAL_LOGO = '/petertecnet-brand.svg?v=20260907-official-loader'
  if (customElements.get(TAG)) return

  const DEFAULT_MESSAGES = [
    'Conectando as soluções do ecossistema Peter Tecnet…',
    'Organizando produtos, serviços e experiências para você…',
    'Sincronizando informações com a API central…',
    'Preparando uma experiência mais rápida e inteligente…',
    'Quase lá — alinhando os últimos detalhes da página…',
  ]

  class PeterProcessingIndicator extends HTMLElement {
    static get observedAttributes() {
      return ['progress', 'total', 'progress-label', 'progress-detail']
    }

    connectedCallback() {
      if (this.dataset.ready === 'true') {
        this._syncProgress()
        return
      }
      this.dataset.ready = 'true'
      this._index = 0
      this._messages = (this.getAttribute('messages') || '')
        .split('|')
        .map(value => value.trim())
        .filter(Boolean)
      if (!this._messages.length) this._messages = DEFAULT_MESSAGES

      const screen = this.hasAttribute('screen')
      const compact = this.hasAttribute('compact')
      const title = this.getAttribute('title') || 'Preparando a Peter Tecnet'
      const eyebrow = this.getAttribute('eyebrow') || 'PETER TECNET · PROCESSANDO'

      this.innerHTML = `
        <div class="pt-processing${screen ? ' pt-processing--screen' : ''}${compact ? ' pt-processing--compact' : ''}" role="status" aria-live="polite" aria-busy="true" aria-label="${this._escape(this._messages[0])}">
          ${screen ? '<div class="pt-processing__grid" aria-hidden="true"></div>' : ''}
          <div class="pt-processing__ambient" aria-hidden="true">
            <i class="pt-processing__spark pt-processing__spark--one"></i>
            <i class="pt-processing__spark pt-processing__spark--two"></i>
            <i class="pt-processing__spark pt-processing__spark--three"></i>
          </div>
          <div class="pt-processing__card">
            <div class="pt-processing__visual" aria-hidden="true">
              <span class="pt-processing__orbit"></span>
              <span class="pt-processing__pulse"></span>
              <img class="pt-processing__logo" src="${OFFICIAL_LOGO}" alt="" decoding="async" fetchpriority="high" />
            </div>
            <p class="pt-processing__eyebrow">${this._escape(eyebrow)}</p>
            <strong class="pt-processing__title">${this._escape(title)}</strong>
            <p class="pt-processing__message">${this._escape(this._messages[0])}</p>
            <div class="pt-processing__bar" aria-hidden="true"><span class="pt-processing__bar-value"></span></div>
            <div class="pt-processing__progress" hidden>
              <strong class="pt-processing__progress-label"></strong>
              <span class="pt-processing__progress-detail"></span>
            </div>
            <div class="pt-processing__beat" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
            <div class="pt-processing__status"><span class="pt-processing__dot"></span><span>experiência em preparação</span></div>
          </div>
        </div>`

      this._root = this.querySelector('.pt-processing')
      this._messageNode = this.querySelector('.pt-processing__message')
      this._barNode = this.querySelector('.pt-processing__bar')
      this._barValueNode = this.querySelector('.pt-processing__bar-value')
      this._progressNode = this.querySelector('.pt-processing__progress')
      this._progressLabelNode = this.querySelector('.pt-processing__progress-label')
      this._progressDetailNode = this.querySelector('.pt-processing__progress-detail')
      this._syncProgress()

      if (this._messages.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this._timer = window.setInterval(() => this._nextMessage(), 2400)
      }
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue || this.dataset.ready !== 'true') return
      this._syncProgress()
    }

    disconnectedCallback() {
      if (this._timer) window.clearInterval(this._timer)
      this._timer = null
    }

    _syncProgress() {
      if (!this._barNode || !this._barValueNode || !this._progressNode) return

      const progress = Number(this.getAttribute('progress'))
      const total = Number(this.getAttribute('total'))
      const determinate = Number.isFinite(progress) && Number.isFinite(total) && total > 0
      const label = this.getAttribute('progress-label') || ''
      const detail = this.getAttribute('progress-detail') || ''

      this._barNode.classList.toggle('is-determinate', determinate)
      if (determinate) {
        const normalized = Math.min(Math.max(progress, 0), total)
        const percent = Math.min(100, Math.max(0, (normalized / total) * 100))
        this._barValueNode.style.width = `${percent}%`
        this._barNode.setAttribute('role', 'progressbar')
        this._barNode.setAttribute('aria-valuemin', '0')
        this._barNode.setAttribute('aria-valuemax', String(total))
        this._barNode.setAttribute('aria-valuenow', String(normalized))
        this._root?.setAttribute('aria-label', label || `${normalized} de ${total} processados`)
      } else {
        this._barValueNode.style.width = '0%'
        this._barNode.removeAttribute('role')
        this._barNode.removeAttribute('aria-valuemin')
        this._barNode.removeAttribute('aria-valuemax')
        this._barNode.removeAttribute('aria-valuenow')
      }

      const showProgress = determinate || Boolean(label) || Boolean(detail)
      this._progressNode.hidden = !showProgress
      if (this._progressLabelNode) this._progressLabelNode.textContent = label || (determinate ? `${progress} de ${total}` : '')
      if (this._progressDetailNode) {
        this._progressDetailNode.textContent = detail
        this._progressDetailNode.hidden = !detail
      }
    }

    _nextMessage() {
      if (!this._messageNode || !this.isConnected) return
      this._messageNode.classList.add('is-changing')
      window.setTimeout(() => {
        if (!this._messageNode || !this.isConnected) return
        this._index = (this._index + 1) % this._messages.length
        const next = this._messages[this._index]
        this._messageNode.textContent = next
        if (!this.hasAttribute('progress-label')) this._root?.setAttribute('aria-label', next)
        this._messageNode.classList.remove('is-changing')
      }, 220)
    }

    _escape(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
    }
  }

  customElements.define(TAG, PeterProcessingIndicator)

  const upgradeLegacyStates = () => {
    document.querySelectorAll('.mkt-state:not([data-pt-processing-upgraded]), .aee-empty:not([data-pt-processing-upgraded])').forEach(node => {
      const text = node.textContent?.trim() || ''
      if (!/carregando|consultando|buscando|preparando/i.test(text)) return
      node.dataset.ptProcessingUpgraded = 'true'
      const indicator = document.createElement(TAG)
      indicator.setAttribute('compact', '')
      indicator.setAttribute('title', 'Carregando conteúdo')
      indicator.setAttribute('messages', `${text}|Conectando os dados da Peter Tecnet…|Só mais um instante — estamos organizando tudo para você…`)
      node.replaceChildren(indicator)
    })
  }

  const observer = new MutationObserver(upgradeLegacyStates)
  const start = () => {
    upgradeLegacyStates()
    observer.observe(document.documentElement, { childList: true, subtree: true })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
})()
