(() => {
  'use strict'

  const VERSION = '1.0.0'
  const ELEMENT = 'peter-insight-chart'

  if (window.PeterTecnetInsights?.version === VERSION && customElements.get(ELEMENT)) return

  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0

  const formatters = {
    number: value => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(number(value)),
    compact: value => new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(number(value)),
    currency: value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number(value)),
    percent: value => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(number(value))}%`,
  }

  class PeterInsightChart extends HTMLElement {
    static get observedAttributes() {
      return ['type', 'title', 'subtitle', 'data', 'label-key', 'value-key', 'secondary-key', 'format', 'primary-label', 'secondary-label', 'empty-text']
    }

    constructor() {
      super()
      this.attachShadow({ mode: 'open' })
    }

    connectedCallback() { this.render() }
    attributeChangedCallback() { if (this.isConnected) this.render() }

    get config() {
      const type = ['bar', 'line', 'donut'].includes(this.getAttribute('type')) ? this.getAttribute('type') : 'bar'
      const labelKey = this.getAttribute('label-key') || 'label'
      const valueKey = this.getAttribute('value-key') || 'value'
      const secondaryKey = this.getAttribute('secondary-key') || ''
      const format = formatters[this.getAttribute('format')] ? this.getAttribute('format') : 'number'
      let parsed = []
      try { parsed = JSON.parse(this.getAttribute('data') || '[]') } catch { parsed = [] }
      const data = (Array.isArray(parsed) ? parsed : []).slice(0, 24).map((item, index) => ({
        label: String(item?.[labelKey] ?? `Item ${index + 1}`),
        value: number(item?.[valueKey]),
        secondary: secondaryKey ? number(item?.[secondaryKey]) : null,
      }))
      return {
        type,
        data,
        format,
        title: this.getAttribute('title') || 'Indicador',
        subtitle: this.getAttribute('subtitle') || '',
        primaryLabel: this.getAttribute('primary-label') || 'Principal',
        secondaryLabel: this.getAttribute('secondary-label') || '',
        emptyText: this.getAttribute('empty-text') || 'Ainda não há dados suficientes para esta visualização.',
      }
    }

    formatter(format) { return formatters[format] || formatters.number }

    renderHeader(config) {
      const hasSecondary = config.data.some(item => item.secondary !== null)
      return `<header class="head"><div><span class="eyebrow">Peter Tecnet Insights</span><h3>${escapeHtml(config.title)}</h3>${config.subtitle ? `<p>${escapeHtml(config.subtitle)}</p>` : ''}</div><div class="legend"><span><i class="dot primary"></i>${escapeHtml(config.primaryLabel)}</span>${hasSecondary ? `<span><i class="dot secondary"></i>${escapeHtml(config.secondaryLabel || 'Comparativo')}</span>` : ''}</div></header>`
    }

    renderBars(config) {
      const format = this.formatter(config.format)
      const max = Math.max(1, ...config.data.flatMap(item => [Math.abs(item.value), Math.abs(item.secondary ?? 0)]))
      return `<div class="bars" role="img" aria-label="${escapeHtml(config.title)}">
        ${config.data.map(item => {
          const primaryWidth = Math.max(item.value === 0 ? 0 : 2, Math.min(100, Math.abs(item.value) / max * 100))
          const secondaryWidth = item.secondary === null ? null : Math.max(item.secondary === 0 ? 0 : 2, Math.min(100, Math.abs(item.secondary) / max * 100))
          return `<div class="bar-row"><div class="bar-label"><span>${escapeHtml(item.label)}</span><b>${escapeHtml(format(item.value))}</b></div><div class="track"><i class="fill primary" style="width:${primaryWidth.toFixed(2)}%"></i>${secondaryWidth === null ? '' : `<i class="fill secondary offset" style="width:${secondaryWidth.toFixed(2)}%"></i>`}</div>${item.secondary === null ? '' : `<small>${escapeHtml(config.secondaryLabel || 'Comparativo')}: ${escapeHtml(format(item.secondary))}</small>`}</div>`
        }).join('')}
      </div>`
    }

    linePath(values, width, height, max) {
      if (!values.length) return ''
      const usableHeight = height - 44
      return values.map((value, index) => {
        const x = values.length === 1 ? width / 2 : index / (values.length - 1) * width
        const y = 20 + usableHeight - Math.max(0, number(value)) / max * usableHeight
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
      }).join(' ')
    }

    renderLine(config) {
      const width = 1000
      const height = 250
      const values = config.data.map(item => item.value)
      const secondary = config.data.map(item => item.secondary ?? 0)
      const hasSecondary = config.data.some(item => item.secondary !== null)
      const max = Math.max(1, ...values, ...(hasSecondary ? secondary : []))
      const path = this.linePath(values, width, height, max)
      const secondPath = hasSecondary ? this.linePath(secondary, width, height, max) : ''
      const step = Math.max(1, Math.ceil(config.data.length / 6))
      const labels = config.data.filter((_, index) => index === 0 || index === config.data.length - 1 || index % step === 0)
      return `<div class="line-wrap" role="img" aria-label="${escapeHtml(config.title)}"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><g class="grid"><line x1="0" x2="${width}" y1="20" y2="20"/><line x1="0" x2="${width}" y1="87" y2="87"/><line x1="0" x2="${width}" y1="154" y2="154"/><line x1="0" x2="${width}" y1="221" y2="221"/></g><path class="line primary-line" d="${path}"/>${secondPath ? `<path class="line secondary-line" d="${secondPath}"/>` : ''}</svg><div class="axis">${labels.map(item => `<span>${escapeHtml(item.label)}</span>`).join('')}</div></div>`
    }

    renderDonut(config) {
      const format = this.formatter(config.format)
      const positive = config.data.map(item => Math.max(0, item.value))
      const total = positive.reduce((sum, value) => sum + value, 0)
      let offset = 0
      const circles = config.data.map((item, index) => {
        const percentage = total > 0 ? positive[index] / total * 100 : 0
        const circle = `<circle class="segment segment-${index % 8}" cx="90" cy="90" r="68" pathLength="100" stroke-dasharray="${percentage.toFixed(4)} ${(100 - percentage).toFixed(4)}" stroke-dashoffset="${(-offset).toFixed(4)}"/>`
        offset += percentage
        return circle
      }).join('')
      return `<div class="donut-layout"><div class="donut" role="img" aria-label="${escapeHtml(config.title)}"><svg viewBox="0 0 180 180"><circle class="donut-bg" cx="90" cy="90" r="68"/>${circles}</svg><div class="donut-center"><strong>${escapeHtml(format(total))}</strong><span>Total</span></div></div><div class="donut-list">${config.data.map((item, index) => `<div><span><i class="swatch swatch-${index % 8}"></i>${escapeHtml(item.label)}</span><b>${escapeHtml(format(item.value))}</b></div>`).join('')}</div></div>`
    }

    styles() {
      return `<style>
        :host{--pt-chart-a:#5b7cff;--pt-chart-b:#22b99a;--pt-chart-c:#a66cff;--pt-chart-d:#f0a23a;--pt-chart-e:#ef6474;--pt-chart-f:#28a3d7;--pt-chart-g:#7183a5;--pt-chart-h:#c969b7;display:block;min-width:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:CanvasText}
        *{box-sizing:border-box}.card{min-width:0;height:100%;padding:20px;border:1px solid color-mix(in srgb,CanvasText 12%,transparent);border-radius:20px;background:linear-gradient(145deg,color-mix(in srgb,Canvas 96%,var(--pt-chart-a) 4%),Canvas);box-shadow:0 12px 36px color-mix(in srgb,CanvasText 8%,transparent);overflow:hidden}.head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px}.eyebrow{display:block;margin-bottom:5px;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:color-mix(in srgb,CanvasText 55%,transparent)}h3{margin:0;font-size:18px;line-height:1.2}p{margin:7px 0 0;max-width:640px;font-size:12px;line-height:1.45;color:color-mix(in srgb,CanvasText 62%,transparent)}.legend{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:9px 14px;font-size:10px;color:color-mix(in srgb,CanvasText 65%,transparent)}.legend span{display:flex;align-items:center;gap:5px;white-space:nowrap}.dot,.swatch{display:inline-block;width:8px;height:8px;border-radius:99px}.primary{background:var(--pt-chart-a)}.secondary{background:var(--pt-chart-b)}.empty{min-height:180px;display:grid;place-items:center;text-align:center;color:color-mix(in srgb,CanvasText 55%,transparent);font-size:12px;padding:24px}
        .bars{display:grid;gap:13px}.bar-row{min-width:0}.bar-label{display:flex;justify-content:space-between;gap:14px;margin-bottom:6px;font-size:11px}.bar-label span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:color-mix(in srgb,CanvasText 72%,transparent)}.bar-label b{font-size:11px}.track{height:9px;border-radius:99px;background:color-mix(in srgb,CanvasText 8%,transparent);overflow:hidden;position:relative}.fill{position:absolute;left:0;top:0;height:100%;border-radius:inherit;transition:width .25s ease}.fill.primary{background:linear-gradient(90deg,var(--pt-chart-a),color-mix(in srgb,var(--pt-chart-a) 70%,white))}.fill.secondary.offset{height:3px;top:auto;bottom:0;background:var(--pt-chart-b)}.bar-row small{display:block;margin-top:4px;font-size:9px;color:color-mix(in srgb,CanvasText 52%,transparent)}
        .line-wrap{min-width:0}.line-wrap svg{width:100%;height:230px;overflow:visible}.grid line{stroke:color-mix(in srgb,CanvasText 9%,transparent);stroke-width:1}.line{fill:none;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;stroke-width:3}.primary-line{stroke:var(--pt-chart-a)}.secondary-line{stroke:var(--pt-chart-b);stroke-width:2}.axis{display:flex;justify-content:space-between;gap:5px;margin-top:7px;font-size:9px;color:color-mix(in srgb,CanvasText 52%,transparent)}.axis span{white-space:nowrap}
        .donut-layout{display:grid;grid-template-columns:minmax(150px,220px) minmax(0,1fr);align-items:center;gap:22px}.donut{position:relative;aspect-ratio:1;max-width:210px;margin:auto;width:100%}.donut svg{width:100%;height:100%;transform:rotate(-90deg)}.donut-bg,.segment{fill:none;stroke-width:20}.donut-bg{stroke:color-mix(in srgb,CanvasText 7%,transparent)}.segment{stroke-linecap:butt;transition:stroke-dasharray .25s ease}.segment-0{stroke:var(--pt-chart-a)}.segment-1{stroke:var(--pt-chart-b)}.segment-2{stroke:var(--pt-chart-c)}.segment-3{stroke:var(--pt-chart-d)}.segment-4{stroke:var(--pt-chart-e)}.segment-5{stroke:var(--pt-chart-f)}.segment-6{stroke:var(--pt-chart-g)}.segment-7{stroke:var(--pt-chart-h)}.donut-center{position:absolute;inset:28%;display:grid;place-content:center;text-align:center}.donut-center strong{font-size:16px}.donut-center span{font-size:9px;color:color-mix(in srgb,CanvasText 55%,transparent)}.donut-list{display:grid;gap:9px}.donut-list>div{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:8px;border-bottom:1px solid color-mix(in srgb,CanvasText 8%,transparent);font-size:11px}.donut-list span{display:flex;align-items:center;gap:7px;min-width:0}.swatch-0{background:var(--pt-chart-a)}.swatch-1{background:var(--pt-chart-b)}.swatch-2{background:var(--pt-chart-c)}.swatch-3{background:var(--pt-chart-d)}.swatch-4{background:var(--pt-chart-e)}.swatch-5{background:var(--pt-chart-f)}.swatch-6{background:var(--pt-chart-g)}.swatch-7{background:var(--pt-chart-h)}
        @media(max-width:640px){.card{padding:16px;border-radius:17px}.head{display:block}.legend{justify-content:flex-start;margin-top:10px}h3{font-size:16px}.line-wrap svg{height:185px}.donut-layout{grid-template-columns:1fr}.donut{max-width:170px}.bar-label{font-size:10px}.axis{font-size:8px}}
        @media(prefers-reduced-motion:reduce){.fill,.segment{transition:none}}
      </style>`
    }

    render() {
      const config = this.config
      const content = !config.data.length
        ? `<div class="empty">${escapeHtml(config.emptyText)}</div>`
        : config.type === 'line'
          ? this.renderLine(config)
          : config.type === 'donut'
            ? this.renderDonut(config)
            : this.renderBars(config)
      this.shadowRoot.innerHTML = `${this.styles()}<section class="card">${this.renderHeader(config)}${content}</section>`
    }
  }

  if (!customElements.get(ELEMENT)) customElements.define(ELEMENT, PeterInsightChart)

  window.PeterTecnetInsights = Object.freeze({ version: VERSION, element: ELEMENT })
})()
