import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AutomationCenter from '../AutomationCenter.jsx'

const apps = [
  { id: 11, slug: 'a', name: 'Aplicação A', capabilities: ['operations.view', 'admin.access.manage'] },
  { id: 22, slug: 'b', name: 'Aplicação B', capabilities: ['operations.view', 'admin.access.manage'] },
]
const dto = (application_id, worker = 'discovery_quality', extra = {}) => ({
  data: {
    application_id, global_enabled: true,
    workers: [{ key: worker, enabled: true, interval_minutes: 15 }],
    recent_runs: [], ...extra,
  },
})
function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('petertecnet_admin_token', 'A')
  globalThis.__ADMIN_IMPORT_META_ENV__ = { VITE_API_URL: 'https://api.example.invalid/api' }
})

test('GET A tardio não sobrescreve dashboard B', async () => {
  const pendingA = deferred()
  const request = jest.fn(path => path.includes('/a/') ? pendingA.promise : Promise.resolve(dto(22, 'catalog_quality')))
  render(<AutomationCenter applications={apps} request={request}/>)
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  fireEvent.change(screen.getByLabelText('Aplicação'), { target: { value: 'b' } })
  expect(await screen.findByText('Qualidade do catálogo')).toBeTruthy()
  await act(async () => pendingA.resolve(dto(11, 'discovery_health')))
  expect(screen.queryByText('Saúde das fontes')).toBeNull()
  expect(screen.getByText('Qualidade do catálogo')).toBeTruthy()
})

test('PUT A pendente → B não mostra aviso ou dados A', async () => {
  const pendingPut = deferred()
  const request = jest.fn((path, options) => {
    if (options?.method === 'PUT') return pendingPut.promise
    return Promise.resolve(path.includes('/b/') ? dto(22, 'catalog_quality') : dto(11))
  })
  render(<AutomationCenter applications={apps} request={request}/>)
  await screen.findByText('Qualidade dos candidatos')
  fireEvent.click(screen.getByRole('button', { name: 'Pausar' }))
  await waitFor(() => expect(request.mock.calls.some(([, opts]) => opts?.method === 'PUT')).toBe(true))
  fireEvent.change(screen.getByLabelText('Aplicação'), { target: { value: 'b' } })
  expect(await screen.findByText('Qualidade do catálogo')).toBeTruthy()
  await act(async () => pendingPut.resolve({ ok: true }))
  expect(screen.queryByText('Configuração salva.')).toBeNull()
  expect(screen.queryByText('Qualidade dos candidatos')).toBeNull()
})

test('A→B→A: primeira resposta A não sobrescreve segunda A', async () => {
  const firstA = deferred()
  let aCalls = 0
  const request = jest.fn(path => {
    if (path.includes('/a/')) return ++aCalls === 1 ? firstA.promise : Promise.resolve(dto(11, 'catalog_quality'))
    return Promise.resolve(dto(22, 'discovery_health'))
  })
  render(<AutomationCenter applications={apps} request={request}/>)
  await waitFor(() => expect(aCalls).toBe(1))
  fireEvent.change(screen.getByLabelText('Aplicação'), { target: { value: 'b' } })
  await screen.findByText('Saúde das fontes')
  fireEvent.change(screen.getByLabelText('Aplicação'), { target: { value: 'a' } })
  expect(await screen.findByText('Qualidade do catálogo')).toBeTruthy()
  await act(async () => firstA.resolve(dto(11, 'discovery_quality')))
  expect(screen.queryByText('Qualidade dos candidatos')).toBeNull()
})

test('sem operations.view: não consulta API; sem admin.access.manage: leitura sem mutação', async () => {
  const request = jest.fn().mockResolvedValue(dto(11))
  const { rerender } = render(<AutomationCenter applications={[{ ...apps[0], capabilities: [] }]} request={request}/>)
  expect(await screen.findByText(/Permissão operations.view/)).toBeTruthy()
  expect(request).not.toHaveBeenCalled()
  rerender(<AutomationCenter applications={[{ ...apps[0], capabilities: ['operations.view'] }]} request={request}/>)
  await screen.findByText('Qualidade dos candidatos')
  expect(screen.getByRole('button', { name: 'Pausar' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Executar' }).disabled).toBe(true)
})

test('DTO sem application_id canônico ou de outro app é rejeitado', async () => {
  const request = jest.fn().mockResolvedValue(dto(22))
  render(<AutomationCenter applications={[apps[0]]} request={request}/>)
  expect(await screen.findByText('Não foi possível consultar os workers desta aplicação.')).toBeTruthy()
  expect(screen.queryByText('Qualidade dos candidatos')).toBeNull()
})

test('run.result e error_type somente por allowlist, sem dados brutos', async () => {
  const request = jest.fn().mockResolvedValue(dto(11, 'discovery_quality', {
    recent_runs: [{ id: 1, worker_key: 'discovery_quality', status: 'failed',
      result: { processed: 2, access_token: 'SEGREDO-A', customer: { cpf: 'CPF-A' } },
      error_type: 'SQL password=SEGREDO-B' }],
  }))
  render(<AutomationCenter applications={[apps[0]]} request={request}/>)
  expect(await screen.findByText('Processados: 2')).toBeTruthy()
  expect(screen.queryByText(/SEGREDO|CPF-A|SQL password/)).toBeNull()
})

test.each([401, 403])('%s tardio ou erro bruto não expõe conteúdo de A em B', async status => {
  const pendingA = deferred()
  const request = jest.fn(path => path.includes('/a/') ? pendingA.promise : Promise.resolve(dto(22)))
  render(<AutomationCenter applications={apps} request={request}/>)
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  fireEvent.change(screen.getByLabelText('Aplicação'), { target: { value: 'b' } })
  await screen.findByText('Qualidade dos candidatos')
  await act(async () => pendingA.reject({ status, message: 'token A segredo' }))
  expect(screen.queryByText(/token A segredo/)).toBeNull()
  expect(screen.queryByText('Sem permissão para esta operação.')).toBeNull()
})

test('storage event com troca de sessão invalida dados antigos', async () => {
  const pendingB = deferred()
  const request = jest.fn().mockResolvedValueOnce(dto(11)).mockReturnValueOnce(pendingB.promise)
  render(<AutomationCenter applications={[apps[0]]} request={request}/>)
  await screen.findByText('Qualidade dos candidatos')
  await act(async () => {
    localStorage.setItem('petertecnet_admin_token', 'B')
    window.dispatchEvent(new StorageEvent('storage', { key: 'petertecnet_admin_token', newValue: 'B' }))
  })
  expect(screen.queryByText('Qualidade dos candidatos')).toBeNull()
  await act(async () => pendingB.resolve(dto(11, 'catalog_quality')))
  expect(screen.getByText('Qualidade do catálogo')).toBeTruthy()
})

test('aplicação B removida não causa fallback silencioso para A', async () => {
  const request = jest.fn(path => Promise.resolve(path.includes('/b/') ? dto(22, 'catalog_quality') : dto(11)))
  const { rerender } = render(<AutomationCenter applications={apps} request={request}/>)
  await screen.findByText('Qualidade dos candidatos')
  fireEvent.change(screen.getByLabelText('Aplicação'), { target: { value: 'b' } })
  await screen.findByText('Qualidade do catálogo')
  const before = request.mock.calls.length
  rerender(<AutomationCenter applications={[apps[0]]} request={request}/>)
  expect(screen.getByText('Aplicação não selecionada ou indisponível.')).toBeTruthy()
  expect(screen.queryByText('Qualidade dos candidatos')).toBeNull()
  expect(screen.queryByText('Qualidade do catálogo')).toBeNull()
  expect(request.mock.calls.length).toBe(before)
})

test.each([320, 360, 390, 430])('smoke RTL viewport %spx sem fallback ou ações sem RBAC', async width => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  const request = jest.fn().mockResolvedValue(dto(11))
  render(<AutomationCenter applications={[{ ...apps[0], capabilities: ['operations.view'] }]} request={request}/>)
  await screen.findByText('Qualidade dos candidatos')
  expect(screen.getByRole('button', { name: 'Pausar' }).disabled).toBe(true)
  expect(screen.getByLabelText('Aplicação')).toBeTruthy()
})
