import { useEffect, useId, useMemo, useState } from 'react'

export function PageHeader({ eyebrow = 'Gestão', title, description, icon, breadcrumbs = [], context, count, status, actions, compact = false }) {
  return <header className={`adm-page-header${compact ? ' is-compact' : ''}`}>
    <div className="adm-page-header__main">
      {breadcrumbs.length > 0 && <nav className="adm-breadcrumbs" aria-label="Navegação estrutural">{breadcrumbs.map((item, index) => <span key={`${item}-${index}`}>{index > 0 && <i aria-hidden="true">/</i>}{item}</span>)}</nav>}
      <div className="adm-page-header__identity">
        {icon && <span className="adm-page-header__icon" aria-hidden="true">{icon}</span>}
        <div>
          <p className="adm-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {description && <p className="adm-page-header__description">{description}</p>}
        </div>
      </div>
      {(context || count != null || status) && <div className="adm-page-header__meta">
        {context && <span>{context}</span>}
        {count != null && <span><strong>{Number(count).toLocaleString('pt-BR')}</strong> registros</span>}
        {status && <StatusBadge status={status}>{status}</StatusBadge>}
      </div>}
    </div>
    {actions && <div className="adm-page-header__actions">{actions}</div>}
  </header>
}

export function StatusBadge({ status = 'neutral', children }) {
  const normalized = String(status).toLowerCase().replace(/[^a-z0-9-]/g, '-')
  return <span className={`adm-status is-${normalized}`}>{children}</span>
}

export function KpiCard({ label, value, icon, comparison, trend = 'neutral', status, sparkline = [], onClick, action }) {
  const points = useMemo(() => {
    if (!sparkline?.length) return ''
    const values = sparkline.map(Number).filter(Number.isFinite)
    if (!values.length) return ''
    const min = Math.min(...values), max = Math.max(...values), range = max - min || 1
    return values.map((item, index) => `${(index / Math.max(1, values.length - 1)) * 100},${28 - ((item - min) / range) * 24}`).join(' ')
  }, [sparkline])
  const Tag = onClick ? 'button' : 'article'
  return <Tag className={`adm-kpi is-${trend}${onClick ? ' is-clickable' : ''}`} {...(onClick ? { type: 'button', onClick } : {})}>
    <div className="adm-kpi__top"><span className="adm-kpi__label">{icon && <i aria-hidden="true">{icon}</i>}{label}</span>{status && <StatusBadge status={status}>{status}</StatusBadge>}</div>
    <strong className="adm-kpi__value">{value}</strong>
    <div className="adm-kpi__foot">{comparison && <span className={`adm-kpi__trend is-${trend}`}>{comparison}</span>}{action && <span className="adm-kpi__action">{action}</span>}</div>
    {points && <svg className="adm-kpi__spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} /></svg>}
  </Tag>
}

export function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), delay); return () => window.clearTimeout(timer) }, [value, delay])
  return debounced
}

export function FilterBar({ search, onSearch, searchPlaceholder = 'Pesquisar…', filters, quickFilters = [], activeQuickFilter, onQuickFilter, activeCount = 0, onClear, advanced, storageKey }) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  useEffect(() => {
    if (!storageKey) return
    try {
      const saved = window.localStorage.getItem(`admin_filter_advanced_${storageKey}`)
      if (saved != null) setAdvancedOpen(saved === '1')
    } catch {
      // Storage can be unavailable in restricted/private browser contexts; filters must remain usable.
    }
  }, [storageKey])
  const toggleAdvanced = () => setAdvancedOpen(current => {
    const next = !current
    if (storageKey) {
      try { window.localStorage.setItem(`admin_filter_advanced_${storageKey}`, next ? '1' : '0') } catch { /* keep UI state even when persistence is unavailable */ }
    }
    return next
  })
  return <section className="adm-filterbar" aria-label="Filtros">
    <div className="adm-filterbar__row">
      <label className="adm-filterbar__search"><span className="sr-only">Pesquisar</span><input type="search" value={search ?? ''} onChange={event => onSearch?.(event.target.value)} placeholder={searchPlaceholder} /></label>
      {filters && <div className="adm-filterbar__filters">{filters}</div>}
      {advanced && <button type="button" className="adm-button is-secondary" onClick={toggleAdvanced} aria-expanded={advancedOpen}>Filtros avançados{activeCount > 0 ? ` (${activeCount})` : ''}</button>}
      {activeCount > 0 && onClear && <button type="button" className="adm-button is-ghost" onClick={onClear}>Limpar</button>}
    </div>
    {quickFilters.length > 0 && <div className="adm-filterbar__chips" aria-label="Filtros rápidos">{quickFilters.map(item => <button type="button" key={item.value} className={activeQuickFilter === item.value ? 'is-active' : ''} onClick={() => onQuickFilter?.(item.value)}>{item.label}</button>)}</div>}
    {advancedOpen && advanced && <div className="adm-filterbar__advanced">{advanced}</div>}
  </section>
}

export function DataTable({ columns, rows = [], rowKey = 'id', tableLabel = 'Tabela de registros', loading = false, error = '', emptyTitle = 'Nenhum registro encontrado', emptyDescription = 'Ajuste os filtros ou tente novamente.', sort, onSort, selected = [], onSelect, onSelectAll, bulkActions, page = 1, pages = 1, onPage }) {
  const tableId = useId()
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const allSelected = rows.length > 0 && rows.every(row => selectedSet.has(row[rowKey]))
  const getRowLabel = row => row.name ?? row.title ?? row.label ?? row[rowKey]
  const getSortState = column => {
    if (!column.sortable || sort?.key !== column.key) return undefined
    return sort.direction === 'desc' ? 'descending' : 'ascending'
  }
  if (error) return <div className="adm-inline-state is-error" role="alert"><strong>Não foi possível carregar os dados.</strong><span>{error}</span></div>
  return <section className="adm-datatable-shell">
    {selected.length > 0 && bulkActions && <div className="adm-bulkbar"><strong>{selected.length} selecionado(s)</strong>{bulkActions}</div>}
    <div className="adm-datatable-scroll">
      <table id={tableId} className="adm-datatable">
        <caption className="sr-only">{tableLabel}</caption>
        <thead><tr>{onSelect && <th scope="col" className="adm-cell-select"><input type="checkbox" aria-label={`Selecionar todos os registros da ${tableLabel.toLowerCase()}`} aria-controls={tableId} checked={allSelected} onChange={event => onSelectAll?.(event.target.checked, rows)} /></th>}{columns.map(column => <th scope="col" key={column.key} className={column.sticky ? 'is-sticky' : ''} aria-sort={getSortState(column)}>{column.sortable ? <button type="button" onClick={() => onSort?.(column.key)} aria-label={`Ordenar por ${column.label}`}>{column.label}<span aria-hidden="true">{sort?.key === column.key ? (sort.direction === 'desc' ? ' ↓' : ' ↑') : ' ↕'}</span></button> : column.label}</th>)}</tr></thead>
        <tbody>{loading ? Array.from({ length: 5 }, (_, index) => <tr key={`skeleton-${index}`} className="adm-table-skeleton">{onSelect && <td />}{columns.map(column => <td key={column.key}><span /></td>)}</tr>) : rows.map(row => <tr key={row[rowKey]}>{onSelect && <td className="adm-cell-select"><input type="checkbox" aria-label={`Selecionar registro ${getRowLabel(row)}`} checked={selectedSet.has(row[rowKey])} onChange={event => onSelect(row[rowKey], event.target.checked)} /></td>}{columns.map(column => <td key={column.key} data-label={column.label} className={column.sticky ? 'is-sticky' : ''}>{column.render ? column.render(row) : row[column.key]}</td>)}</tr>)}</tbody>
      </table>
    </div>
    {!loading && rows.length === 0 && <div className="adm-inline-state"><strong>{emptyTitle}</strong><span>{emptyDescription}</span></div>}
    {pages > 1 && <nav className="adm-pagination" aria-label="Paginação"><button type="button" disabled={page <= 1} onClick={() => onPage?.(page - 1)}>Anterior</button><span>Página {page} de {pages}</span><button type="button" disabled={page >= pages} onClick={() => onPage?.(page + 1)}>Próxima</button></nav>}
  </section>
}

export function Field({ label, required, error, help, children }) {
  return <label className={`adm-field${error ? ' has-error' : ''}`}><span>{label}{required && <b aria-hidden="true"> *</b>}</span>{children}{error ? <small role="alert">{error}</small> : help ? <small>{help}</small> : null}</label>
}
