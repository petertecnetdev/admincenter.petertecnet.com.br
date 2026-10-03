import { useCallback, useEffect, useMemo, useState } from 'react'
import './MediaLibraryPage.css'

const EMPTY_FORM = {
  application_id: '',
  name: '',
  category: 'general',
  purpose: 'general',
  visibility: 'private',
  kind: 'image',
  public_url: '',
  is_official: false,
  is_marketing_approved: false,
  is_ai_generated: false,
}

const KIND_LABELS = { image: 'Imagem', video: 'Vídeo', document: 'Documento' }

function bytes(value) {
  const size = Number(value || 0)
  if (!size) return '—'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function AssetPreview({ asset }) {
  if (asset.kind === 'image' && asset.url) {
    return <img src={asset.variants?.thumbnail?.url || asset.url} alt={asset.alt_text || asset.name || ''} loading="lazy" />
  }
  if (asset.kind === 'video' && asset.url) {
    return <video src={asset.url} preload="metadata" controls={false} muted playsInline />
  }
  return <div className="media-library__file-placeholder" aria-hidden="true">{asset.kind === 'video' ? '▶' : 'DOC'}</div>
}

function Flag({ children, active, tone = '' }) {
  return <span className={`media-library__flag ${active ? 'is-active' : ''} ${tone}`}>{children}</span>
}

export default function MediaLibraryPage({ request, applications = [] }) {
  const [filters, setFilters] = useState({
    search: '',
    application_id: '',
    kind: '',
    category: '',
    purpose: '',
    is_official: '',
    is_marketing_approved: '',
  })
  const [assets, setAssets] = useState([])
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [selected, setSelected] = useState(null)
  const [relation, setRelation] = useState({ entity_type: '', entity_id: '', role: 'media' })
  const [collections, setCollections] = useState([])
  const [collectionName, setCollectionName] = useState('')
  const [selectedCollection, setSelectedCollection] = useState('')
  const appOptions = useMemo(() => applications.filter(app => app?.id), [applications])

  const loadCollections = useCallback(async applicationId => {
    if (!applicationId) {
      setCollections([])
      return
    }
    try {
      const payload = await request(`/admin/media-library/collections?application_id=${encodeURIComponent(applicationId)}`, {
        cacheMs: 5000,
        cancelKey: 'media-library-collections',
      })
      setCollections(payload?.collections || [])
    } catch {
      setCollections([])
    }
  }, [request])

  const load = useCallback(async (targetPage = page) => {
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ page: String(targetPage), per_page: '30' })
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '') params.set(key, String(value))
    })
    try {
      const payload = await request(`/admin/media-library/assets?${params.toString()}`, {
        cancelKey: 'media-library-assets',
      })
      const paginator = payload?.assets || {}
      setAssets(paginator.data || [])
      setMeta({
        current_page: Number(paginator.current_page || 1),
        last_page: Number(paginator.last_page || 1),
        total: Number(paginator.total || 0),
      })
    } catch (err) {
      setError(err?.message || 'Não foi possível carregar a biblioteca.')
    } finally {
      setLoading(false)
    }
  }, [filters, page, request])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1)
      void load(1)
    }, filters.search ? 280 : 0)
    return () => window.clearTimeout(timer)
  }, [filters])

  useEffect(() => {
    if (page > 1) void load(page)
  }, [page])

  useEffect(() => {
    if (!form.application_id && appOptions.length) {
      const cutinapp = appOptions.find(app => String(app.slug || '').toLowerCase() === 'cutinapp')
      setForm(current => ({ ...current, application_id: String(cutinapp?.id || appOptions[0].id) }))
    }
  }, [appOptions, form.application_id])

  useEffect(() => {
    void loadCollections(selected?.application_id || form.application_id)
  }, [selected?.application_id, form.application_id, loadCollections])

  async function createAsset(event) {
    event.preventDefault()
    if (!form.application_id || (!file && !form.public_url.trim())) return
    setSaving(true)
    setFeedback('')
    try {
      if (file) {
        const body = new FormData()
        body.append('application_id', form.application_id)
        body.append('file', file)
        body.append('name', form.name || file.name)
        body.append('category', form.category)
        body.append('purpose', form.purpose)
        body.append('visibility', form.visibility)
        body.append('is_official', form.is_official ? '1' : '0')
        body.append('is_marketing_approved', form.is_marketing_approved ? '1' : '0')
        body.append('is_ai_generated', form.is_ai_generated ? '1' : '0')
        await request('/admin/media-library/assets', { method: 'POST', body })
      } else {
        await request('/admin/media-library/assets', {
          method: 'POST',
          body: JSON.stringify({
            ...form,
            application_id: Number(form.application_id),
            public_url: form.public_url.trim(),
          }),
        })
      }
      setForm(current => ({ ...EMPTY_FORM, application_id: current.application_id }))
      setFile(null)
      setCreateOpen(false)
      setFeedback('Mídia adicionada à biblioteca.')
      await load(1)
    } catch (err) {
      setFeedback(err?.message || 'Não foi possível adicionar a mídia.')
    } finally {
      setSaving(false)
    }
  }

  async function patchAsset(asset, patch) {
    setSaving(true)
    setFeedback('')
    try {
      const payload = await request(`/admin/media-library/assets/${asset.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      const updated = payload?.asset
      if (updated) {
        setAssets(current => current.map(item => item.id === updated.id ? updated : item))
        setSelected(current => current?.id === updated.id ? updated : current)
      }
      setFeedback('Mídia atualizada.')
    } catch (err) {
      setFeedback(err?.message || 'Não foi possível atualizar a mídia.')
    } finally {
      setSaving(false)
    }
  }

  async function archiveAsset(asset) {
    setSaving(true)
    try {
      await request(`/admin/media-library/assets/${asset.id}`, { method: 'DELETE' })
      setAssets(current => current.filter(item => item.id !== asset.id))
      setSelected(null)
      setFeedback('Mídia arquivada.')
    } catch (err) {
      setFeedback(err?.message || 'Não foi possível arquivar a mídia.')
    } finally {
      setSaving(false)
    }
  }

  async function addRelation(event) {
    event.preventDefault()
    if (!selected || !relation.entity_type.trim() || !relation.entity_id.trim()) return
    setSaving(true)
    try {
      await request(`/admin/media-library/assets/${selected.id}/relations`, {
        method: 'POST',
        body: JSON.stringify(relation),
      })
      const payload = await request(`/admin/media-library/assets/${selected.id}`, { force: true })
      setSelected(payload?.asset || selected)
      setRelation({ entity_type: '', entity_id: '', role: 'media' })
      setFeedback('Vínculo adicionado.')
    } catch (err) {
      setFeedback(err?.message || 'Não foi possível vincular a mídia.')
    } finally {
      setSaving(false)
    }
  }

  async function createCollection(event) {
    event.preventDefault()
    const applicationId = selected?.application_id || form.application_id
    if (!applicationId || !collectionName.trim()) return
    setSaving(true)
    try {
      await request('/admin/media-library/collections', {
        method: 'POST',
        body: JSON.stringify({
          application_id: Number(applicationId),
          name: collectionName.trim(),
          purpose: 'general',
          visibility: 'private',
        }),
      })
      setCollectionName('')
      await loadCollections(applicationId)
      setFeedback('Coleção criada.')
    } catch (err) {
      setFeedback(err?.message || 'Não foi possível criar a coleção.')
    } finally {
      setSaving(false)
    }
  }

  async function attachCollection() {
    if (!selected || !selectedCollection) return
    setSaving(true)
    try {
      await request(`/admin/media-library/collections/${selectedCollection}/assets/${selected.id}`, {
        method: 'POST',
        body: JSON.stringify({ sort_order: 0 }),
      })
      setFeedback('Mídia adicionada à coleção.')
      setSelectedCollection('')
    } catch (err) {
      setFeedback(err?.message || 'Não foi possível adicionar à coleção.')
    } finally {
      setSaving(false)
    }
  }

  const appName = id => appOptions.find(app => String(app.id) === String(id))?.name || `Aplicação #${id}`

  return <div className="media-library">
    <header className="media-library__header">
      <div>
        <p className="eyebrow">MÍDIA CENTRAL</p>
        <h2>Media Library</h2>
        <p>Ativos oficiais, criativos, fotos, vídeos e arquivos reutilizáveis por todo o ecossistema.</p>
      </div>
      <button type="button" className="primary-button" onClick={() => setCreateOpen(open => !open)}>
        {createOpen ? 'Fechar cadastro' : 'Adicionar mídia'}
      </button>
    </header>

    {feedback && <div className="media-library__feedback" role="status">{feedback}</div>}

    {createOpen && <form className="media-library__create" onSubmit={createAsset}>
      <div className="media-library__form-grid">
        <label>Aplicação<select value={form.application_id} onChange={event => setForm({ ...form, application_id: event.target.value })} required>
          <option value="">Selecione</option>
          {appOptions.map(app => <option key={app.id} value={app.id}>{app.name || app.slug}</option>)}
        </select></label>
        <label>Nome<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Logo principal" /></label>
        <label>Categoria<input value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} placeholder="brand, event, marketing…" /></label>
        <label>Uso<input value={form.purpose} onChange={event => setForm({ ...form, purpose: event.target.value })} placeholder="feed, story, cover, og…" /></label>
        <label>Visibilidade<select value={form.visibility} onChange={event => setForm({ ...form, visibility: event.target.value })}>
          <option value="private">Privada</option><option value="public">Pública</option>
        </select></label>
        {!file && <label>Tipo<select value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value })}>
          <option value="image">Imagem</option><option value="video">Vídeo</option><option value="document">Documento</option>
        </select></label>}
      </div>
      <div className="media-library__source">
        <label className="media-library__file-input">Arquivo local
          <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,application/pdf" onChange={event => {
            const next = event.target.files?.[0] || null
            setFile(next)
            if (next) setForm(current => ({ ...current, public_url: '' }))
          }} />
          <span>{file ? file.name : 'Selecionar imagem, vídeo ou PDF'}</span>
        </label>
        <span>ou</span>
        <label>URL HTTPS<input type="url" value={form.public_url} disabled={Boolean(file)} onChange={event => setForm({ ...form, public_url: event.target.value })} placeholder="https://…" /></label>
      </div>
      <div className="media-library__checks">
        <label><input type="checkbox" checked={form.is_official} onChange={event => setForm({ ...form, is_official: event.target.checked })} /> Ativo oficial</label>
        <label><input type="checkbox" checked={form.is_marketing_approved} onChange={event => setForm({ ...form, is_marketing_approved: event.target.checked })} /> Aprovado para marketing</label>
        <label><input type="checkbox" checked={form.is_ai_generated} onChange={event => setForm({ ...form, is_ai_generated: event.target.checked })} /> Gerado/alterado por IA</label>
      </div>
      <button type="submit" className="primary-button" disabled={saving || !form.application_id || (!file && !form.public_url.trim())}>{saving ? 'Salvando…' : 'Salvar na biblioteca'}</button>
    </form>}

    <section className="media-library__filters" aria-label="Filtros da biblioteca">
      <label className="is-search">Pesquisar<input type="search" value={filters.search} onChange={event => setFilters({ ...filters, search: event.target.value })} placeholder="Nome, categoria, uso…" /></label>
      <label>Aplicação<select value={filters.application_id} onChange={event => setFilters({ ...filters, application_id: event.target.value })}>
        <option value="">Todas</option>{appOptions.map(app => <option key={app.id} value={app.id}>{app.name || app.slug}</option>)}
      </select></label>
      <label>Tipo<select value={filters.kind} onChange={event => setFilters({ ...filters, kind: event.target.value })}>
        <option value="">Todos</option><option value="image">Imagem</option><option value="video">Vídeo</option><option value="document">Documento</option>
      </select></label>
      <label>Marketing<select value={filters.is_marketing_approved} onChange={event => setFilters({ ...filters, is_marketing_approved: event.target.value })}>
        <option value="">Todos</option><option value="1">Aprovados</option><option value="0">Não aprovados</option>
      </select></label>
      <label>Oficial<select value={filters.is_official} onChange={event => setFilters({ ...filters, is_official: event.target.value })}>
        <option value="">Todos</option><option value="1">Oficial</option><option value="0">Não oficial</option>
      </select></label>
    </section>

    <div className="media-library__summary"><strong>{meta.total.toLocaleString('pt-BR')}</strong> ativos encontrados</div>

    {error && <div className="media-library__state is-error" role="alert">{error}</div>}
    {loading ? <div className="media-library__grid" aria-busy="true">{Array.from({ length: 8 }, (_, index) => <div className="media-library__skeleton" key={index} />)}</div> :
      assets.length === 0 ? <div className="media-library__state">Nenhuma mídia encontrada para os filtros atuais.</div> :
      <div className="media-library__grid">{assets.map(asset => <article className="media-library__card" key={asset.id}>
        <button type="button" className="media-library__preview" onClick={() => setSelected(asset)} aria-label={`Abrir detalhes de ${asset.name}`}>
          <AssetPreview asset={asset} />
        </button>
        <div className="media-library__card-body">
          <div className="media-library__card-title"><div><strong>{asset.name}</strong><small>{appName(asset.application_id)}</small></div><span>{KIND_LABELS[asset.kind] || asset.kind}</span></div>
          <div className="media-library__flags">
            <Flag active={asset.is_official}>Oficial</Flag>
            <Flag active={asset.is_marketing_approved} tone="is-marketing">Marketing</Flag>
            {asset.is_ai_generated && <Flag active tone="is-ai">IA</Flag>}
          </div>
          <dl><div><dt>Categoria</dt><dd>{asset.category}</dd></div><div><dt>Uso</dt><dd>{asset.purpose}</dd></div><div><dt>Tamanho</dt><dd>{bytes(asset.file_size)}</dd></div></dl>
          <div className="media-library__card-actions">
            <button type="button" onClick={() => patchAsset(asset, { is_official: !asset.is_official })}>{asset.is_official ? 'Remover oficial' : 'Marcar oficial'}</button>
            <button type="button" onClick={() => patchAsset(asset, { is_marketing_approved: !asset.is_marketing_approved })}>{asset.is_marketing_approved ? 'Retirar marketing' : 'Aprovar marketing'}</button>
          </div>
        </div>
      </article>)}</div>}

    {meta.last_page > 1 && <nav className="media-library__pagination" aria-label="Paginação da biblioteca">
      <button type="button" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Anterior</button>
      <span>Página {meta.current_page} de {meta.last_page}</span>
      <button type="button" disabled={page >= meta.last_page} onClick={() => setPage(value => Math.min(meta.last_page, value + 1))}>Próxima</button>
    </nav>}

    {selected && <aside className="media-library__detail" aria-label="Detalhes da mídia">
      <header><div><small>{appName(selected.application_id)}</small><h3>{selected.name}</h3></div><button type="button" onClick={() => setSelected(null)} aria-label="Fechar detalhes">×</button></header>
      <div className="media-library__detail-preview"><AssetPreview asset={selected} /></div>
      <div className="media-library__detail-meta">
        <div><span>Categoria</span><strong>{selected.category}</strong></div>
        <div><span>Uso</span><strong>{selected.purpose}</strong></div>
        <div><span>Formato</span><strong>{selected.mime_type || selected.kind}</strong></div>
        <div><span>Dimensões</span><strong>{selected.width && selected.height ? `${selected.width}×${selected.height}` : '—'}</strong></div>
        <div><span>Variantes</span><strong>{Object.keys(selected.variants || {}).length}</strong></div>
        <div><span>Visibilidade</span><strong>{selected.visibility}</strong></div>
      </div>
      <div className="media-library__detail-actions">
        <button type="button" onClick={() => patchAsset(selected, { visibility: selected.visibility === 'public' ? 'private' : 'public' })}>{selected.visibility === 'public' ? 'Tornar privada' : 'Tornar pública'}</button>
        <button type="button" onClick={() => patchAsset(selected, { is_official: !selected.is_official })}>{selected.is_official ? 'Remover oficial' : 'Marcar oficial'}</button>
        <button type="button" onClick={() => patchAsset(selected, { is_marketing_approved: !selected.is_marketing_approved })}>{selected.is_marketing_approved ? 'Retirar do marketing' : 'Aprovar marketing'}</button>
      </div>

      <section>
        <h4>Vínculos</h4>
        <div className="media-library__relations">{selected.relations?.length ? selected.relations.map(item => <span key={item.id}>{item.entity_type} #{item.entity_id} · {item.role}</span>) : <small>Nenhuma entidade vinculada.</small>}</div>
        <form className="media-library__relation-form" onSubmit={addRelation}>
          <input value={relation.entity_type} onChange={event => setRelation({ ...relation, entity_type: event.target.value })} placeholder="entity_type" aria-label="Tipo da entidade" />
          <input value={relation.entity_id} onChange={event => setRelation({ ...relation, entity_id: event.target.value })} placeholder="ID" aria-label="ID da entidade" />
          <input value={relation.role} onChange={event => setRelation({ ...relation, role: event.target.value })} placeholder="role" aria-label="Papel da mídia" />
          <button type="submit" disabled={saving}>Vincular</button>
        </form>
      </section>

      <section>
        <h4>Coleções</h4>
        <div className="media-library__collection-attach">
          <select value={selectedCollection} onChange={event => setSelectedCollection(event.target.value)}>
            <option value="">Selecione uma coleção</option>
            {collections.map(item => <option key={item.id} value={item.id}>{item.name} ({item.assets_count})</option>)}
          </select>
          <button type="button" disabled={!selectedCollection || saving} onClick={attachCollection}>Adicionar</button>
        </div>
        <form className="media-library__collection-create" onSubmit={createCollection}>
          <input value={collectionName} onChange={event => setCollectionName(event.target.value)} placeholder="Nova coleção" aria-label="Nome da nova coleção" />
          <button type="submit" disabled={!collectionName.trim() || saving}>Criar</button>
        </form>
      </section>

      <details className="media-library__danger">
        <summary>Arquivar mídia</summary>
        <p>O registro sai da biblioteca ativa, mas o arquivo não é apagado fisicamente nesta ação.</p>
        <button type="button" disabled={saving} onClick={() => archiveAsset(selected)}>Confirmar arquivamento</button>
      </details>
    </aside>}
    {selected && <button className="media-library__backdrop" type="button" aria-label="Fechar detalhes" onClick={() => setSelected(null)} />}
  </div>
}
