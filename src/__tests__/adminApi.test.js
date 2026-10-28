const KEY = 'petertecnet_admin_token'
const reply = (status, body = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: () => null }, json: async () => body })
function deferred() {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}
const api = () => require('../adminApi.js')
beforeEach(() => {
  jest.resetModules()
  jest.useRealTimers()
  localStorage.clear()
  globalThis.__ADMIN_IMPORT_META_ENV__ = { VITE_API_URL: 'https://api.example.invalid/api' }
  global.fetch = jest.fn()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})
afterEach(() => jest.useRealTimers())

test('cacheMs>0 isola dados A/B', async () => {
  const { adminRequest } = api()
  localStorage.setItem(KEY, 'A')
  fetch.mockResolvedValueOnce(reply(200, { owner: 'A' })).mockResolvedValueOnce(reply(200, { owner: 'B' }))
  expect(await adminRequest('/items', { cacheMs: 60000 })).toEqual({ owner: 'A' })
  localStorage.setItem(KEY, 'B')
  expect(await adminRequest('/items', { cacheMs: 60000 })).toEqual({ owner: 'B' })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer B')
})

test.each([['GET', undefined], ['PUT', '{"enabled":true}']])('%s simultâneo A/B não compartilha Promise', async (method, body) => {
  const a = deferred(), b = deferred()
  fetch.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
  const { adminRequest } = api()
  const options = method === 'GET' ? {} : { method, body }
  localStorage.setItem(KEY, 'A')
  const old = adminRequest('/workers', options).catch(error => error)
  localStorage.setItem(KEY, 'B')
  const current = adminRequest('/workers', options)
  b.resolve(reply(200, { owner: 'B' }))
  expect(await current).toEqual({ owner: 'B' })
  a.resolve(reply(200, { owner: 'A' }))
  expect((await old).code).toBe('ADMIN_SESSION_CHANGED')
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('401 tardio A não limpa token B', async () => {
  const a = deferred(), b = deferred()
  fetch.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
  const { adminRequest } = api()
  const expired = jest.fn()
  window.addEventListener('admin-session-expired', expired)
  localStorage.setItem(KEY, 'A')
  const old = adminRequest('/auth/me').catch(error => error)
  localStorage.setItem(KEY, 'B')
  const current = adminRequest('/auth/me')
  b.resolve(reply(200, { user: 'B' }))
  await current
  a.resolve(reply(401, { message: 'segredo A' }))
  expect((await old).code).toBe('ADMIN_SESSION_CHANGED')
  expect(localStorage.getItem(KEY)).toBe('B')
  expect(expired).not.toHaveBeenCalled()
  window.removeEventListener('admin-session-expired', expired)
})

test('retry 503 não reutiliza token B', async () => {
  jest.useFakeTimers()
  fetch.mockResolvedValueOnce(reply(503, { message: 'PII A' }))
  const { adminRequest } = api()
  localStorage.setItem(KEY, 'A')
  const old = adminRequest('/items').catch(error => error)
  await Promise.resolve()
  await Promise.resolve()
  localStorage.setItem(KEY, 'B')
  await jest.advanceTimersByTimeAsync(1000)
  expect((await old).code).toBe('ADMIN_SESSION_CHANGED')
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer A')
})

test('retry 408 preserva Bearer A', async () => {
  jest.useFakeTimers()
  fetch.mockResolvedValueOnce(reply(408)).mockResolvedValueOnce(reply(200, { ok: true }))
  const { adminRequest } = api()
  localStorage.setItem(KEY, 'A')
  const pending = adminRequest('/items')
  await jest.advanceTimersByTimeAsync(1000)
  expect(await pending).toEqual({ ok: true })
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer A')
})

test('A→B→A invalida resposta da primeira A', async () => {
  const a = deferred()
  fetch.mockReturnValueOnce(a.promise).mockResolvedValueOnce(reply(200, { owner: 'B' })).mockResolvedValueOnce(reply(200, { owner: 'A-new' }))
  const { adminRequest } = api()
  localStorage.setItem(KEY, 'A')
  const old = adminRequest('/items').catch(error => error)
  localStorage.setItem(KEY, 'B')
  await adminRequest('/items')
  localStorage.setItem(KEY, 'A')
  expect(await adminRequest('/items')).toEqual({ owner: 'A-new' })
  a.resolve(reply(200, { owner: 'A-old' }))
  expect((await old).code).toBe('ADMIN_SESSION_CHANGED')
})

test('erros 403/422 são sanitizados, sem payload bruto', async () => {
  fetch.mockResolvedValueOnce(reply(403, { message: 'token A', errors: { secret: ['CPF A'] } }))
    .mockResolvedValueOnce(reply(422, { message: 'CPF B' }))
  const { adminRequest } = api()
  localStorage.setItem(KEY, 'B')
  const forbidden = await adminRequest('/items').catch(error => error)
  const invalid = await adminRequest('/items', { force: true }).catch(error => error)
  expect(forbidden.message).toBe('Você não tem permissão para esta operação.')
  expect(invalid.message).toBe('Verifique os dados informados.')
  expect(forbidden.payload).toBeUndefined()
  expect(invalid.payload).toBeUndefined()
})

test('storage event invalida resposta antiga', async () => {
  const a = deferred()
  fetch.mockReturnValueOnce(a.promise)
  const { adminRequest, getAdminApiSessionSnapshot } = api()
  localStorage.setItem(KEY, 'A')
  const old = adminRequest('/items').catch(error => error)
  const generation = getAdminApiSessionSnapshot().generation
  localStorage.setItem(KEY, 'B')
  window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: 'B' }))
  expect(getAdminApiSessionSnapshot().generation).toBeGreaterThan(generation)
  a.resolve(reply(200, { owner: 'A' }))
  expect((await old).code).toBe('ADMIN_SESSION_CHANGED')
})

test.each([429, 503])('HTTP %s após troca de sessão não executa retry com token B', async status => {
  jest.useFakeTimers()
  fetch.mockResolvedValueOnce(reply(status, { message: 'PII A' }))
  const { adminRequest } = api()
  localStorage.setItem(KEY, 'A')
  const old = adminRequest('/items').catch(error => error)
  await Promise.resolve()
  await Promise.resolve()
  localStorage.setItem(KEY, 'B')
  await jest.advanceTimersByTimeAsync(1000)
  expect((await old).code).toBe('ADMIN_SESSION_CHANGED')
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('falha de rede após troca de sessão não repete com token B', async () => {
  jest.useFakeTimers()
  fetch.mockRejectedValueOnce(new TypeError('rede interrompida'))
  const { adminRequest } = api()
  localStorage.setItem(KEY, 'A')
  const old = adminRequest('/items').catch(error => error)
  await Promise.resolve()
  await Promise.resolve()
  localStorage.setItem(KEY, 'B')
  await jest.advanceTimersByTimeAsync(1000)
  expect((await old).code).toBe('ADMIN_SESSION_CHANGED')
  expect(fetch).toHaveBeenCalledTimes(1)
})

test.each(['GET', 'PUT'])('deduplicação %s permanece funcional dentro da mesma sessão', async method => {
  const pending = deferred()
  fetch.mockReturnValueOnce(pending.promise)
  const { adminRequest } = api()
  localStorage.setItem(KEY, 'A')
  const options = method === 'GET' ? {} : { method, body: '{"enabled":true}' }
  const first = adminRequest('/workers', options)
  const second = adminRequest('/workers', options)
  expect(fetch).toHaveBeenCalledTimes(1)
  pending.resolve(reply(200, { ok: true }))
  expect(await first).toEqual({ ok: true })
  expect(await second).toEqual({ ok: true })
})

test('401 atual invalida sessão A, sem expor mensagem bruta', async () => {
  fetch.mockResolvedValueOnce(reply(401, { message: 'dados privados de A' }))
  const { adminRequest } = api()
  localStorage.setItem(KEY, 'A')
  const error = await adminRequest('/auth/me').catch(value => value)
  expect(error.status).toBe(401)
  expect(error.message).toBe('Sessão expirada. Entre novamente.')
  expect(localStorage.getItem(KEY)).toBeNull()
})

test('GET forçado ignora cache e resposta antiga não sobrescreve cache novo', async () => {
  const oldResponse = deferred()
  fetch.mockReturnValueOnce(oldResponse.promise)
    .mockResolvedValueOnce(reply(200, { owner: 'atualizado' }))
    .mockResolvedValueOnce(reply(200, { owner: 'atualizado novamente' }))
  const { adminRequest } = api()
  localStorage.setItem(KEY, 'A')
  const old = adminRequest('/items', { cacheMs: 60000 })
  const fresh = adminRequest('/items', { cacheMs: 60000, force: true })
  expect(await fresh).toEqual({ owner: 'atualizado' })
  oldResponse.resolve(reply(200, { owner: 'obsoleto' }))
  expect(await old).toEqual({ owner: 'obsoleto' })
  expect(await adminRequest('/items', { cacheMs: 60000 })).toEqual({ owner: 'atualizado' })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(await adminRequest('/items', { cacheMs: 60000, force: true })).toEqual({ owner: 'atualizado novamente' })
  expect(fetch).toHaveBeenCalledTimes(3)
})

test('falha de GET forçado não restaura cache anterior à revogação', async () => {
  fetch.mockResolvedValueOnce(reply(200, { canManage: true }))
    .mockResolvedValueOnce(reply(403, { message: 'dados privados' }))
    .mockResolvedValueOnce(reply(200, { canManage: false }))
  const { adminRequest } = api()
  localStorage.setItem(KEY, 'A')
  expect(await adminRequest('/permissions', { cacheMs: 60000 })).toEqual({ canManage: true })
  const denied = await adminRequest('/permissions', { cacheMs: 60000, force: true }).catch(error => error)
  expect(denied.status).toBe(403)
  expect(denied.message).toBe('Você não tem permissão para esta operação.')
  expect(await adminRequest('/permissions', { cacheMs: 60000 })).toEqual({ canManage: false })
  expect(fetch).toHaveBeenCalledTimes(3)
})


test('PUT invalida GET pendente: não reutiliza resposta antiga nem contamina cache novo', async () => {
  const oldResponse = deferred()
  fetch.mockReturnValueOnce(oldResponse.promise)
    .mockResolvedValueOnce(reply(200, { saved: true }))
    .mockResolvedValueOnce(reply(200, { owner: 'atualizado' }))
  const { adminRequest } = api()
  localStorage.setItem(KEY, 'A')
  const old = adminRequest('/items', { cacheMs: 60000 })
  expect(await adminRequest('/items', { method: 'PUT', body: '{"enabled":true}' })).toEqual({ saved: true })
  expect(await adminRequest('/items', { cacheMs: 60000 })).toEqual({ owner: 'atualizado' })
  expect(fetch).toHaveBeenCalledTimes(3)
  oldResponse.resolve(reply(200, { owner: 'obsoleto' }))
  expect(await old).toEqual({ owner: 'obsoleto' })
  expect(await adminRequest('/items', { cacheMs: 60000 })).toEqual({ owner: 'atualizado' })
  expect(fetch).toHaveBeenCalledTimes(3)
})

test('falha de rede após retry GET é sanitizada sem expor dados internos', async () => {
  jest.useFakeTimers()
  fetch.mockRejectedValueOnce(new TypeError('URL privada de A e token secreto'))
    .mockRejectedValueOnce(new TypeError('detalhe privado da conexão'))
  const { adminRequest } = api()
  localStorage.setItem(KEY, 'A')
  const pending = adminRequest('/items').catch(error => error)
  await jest.advanceTimersByTimeAsync(1000)
  const error = await pending
  expect(error.code).toBe('ADMIN_API_NETWORK')
  expect(error.message).toBe('Falha de conexão com o serviço. Tente novamente.')
  expect(error.message).not.toMatch(/privad|token|secreto/i)
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls.map(([, options]) => options.headers.Authorization)).toEqual(['Bearer A', 'Bearer A'])
})

test('falha de rede PUT não repete mutação nem expõe mensagem bruta', async () => {
  fetch.mockRejectedValueOnce(new TypeError('segredo do cliente A'))
  const { adminRequest } = api()
  localStorage.setItem(KEY, 'A')
  const error = await adminRequest('/workers', { method: 'PUT', body: '{"enabled":true}' }).catch(value => value)
  expect(error.code).toBe('ADMIN_API_NETWORK')
  expect(error.message).toBe('Falha de conexão com o serviço. Tente novamente.')
  expect(error.message).not.toContain('segredo')
  expect(fetch).toHaveBeenCalledTimes(1)
})

test.each(['GET', 'PUT'])('%s com application-id distinto não compartilha requisição ou cache', async method => {
  const pendingA = deferred()
  const pendingB = deferred()
  fetch.mockReturnValueOnce(pendingA.promise).mockReturnValueOnce(pendingB.promise)
  const { adminRequest } = api()
  localStorage.setItem(KEY, 'A')
  const base = method === 'GET' ? { cacheMs: 60000 } : { method, body: '{"enabled":true}' }
  const requestA = adminRequest('/shared/workers', { ...base, headers: { 'X-Application-Id': '11' } })
  const requestB = adminRequest('/shared/workers', { ...base, headers: { 'x-application-id': '22' } })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls[0][1].headers['X-Application-Id']).toBe('11')
  expect(fetch.mock.calls[1][1].headers['x-application-id']).toBe('22')
  pendingB.resolve(reply(200, { owner: 'B' }))
  pendingA.resolve(reply(200, { owner: 'A' }))
  expect(await requestB).toEqual({ owner: 'B' })
  expect(await requestA).toEqual({ owner: 'A' })
  if (method === 'GET') {
    expect(await adminRequest('/shared/workers', { ...base, headers: { 'x-application-id': '11' } })).toEqual({ owner: 'A' })
    expect(await adminRequest('/shared/workers', { ...base, headers: { 'X-Application-Id': '22' } })).toEqual({ owner: 'B' })
    expect(fetch).toHaveBeenCalledTimes(2)
  }
})

test('mesmo cabeçalho com ordem e caixa diferentes mantém deduplicação GET', async () => {
  const pending = deferred()
  fetch.mockReturnValueOnce(pending.promise)
  const { adminRequest } = api()
  localStorage.setItem(KEY, 'A')
  const first = adminRequest('/shared/workers', {
    headers: { 'X-Application-Id': '11', 'X-Trace': 'same' },
  })
  const second = adminRequest('/shared/workers', {
    headers: { 'x-trace': 'same', 'x-application-id': '11' },
  })
  expect(fetch).toHaveBeenCalledTimes(1)
  pending.resolve(reply(200, { owner: 'A' }))
  expect(await first).toEqual({ owner: 'A' })
  expect(await second).toEqual({ owner: 'A' })
})


test.each(['GET', 'PUT'])('%s ignora Authorization arbitrário em qualquer caixa e usa somente Bearer da sessão', async method => {
  fetch.mockResolvedValueOnce(reply(200, { ok: true }))
  const { adminRequest } = api()
  localStorage.setItem(KEY, 'A')
  const options = {
    method,
    ...(method === 'PUT' ? { body: '{"enabled":true}' } : {}),
    headers: {
      AUTHORIZATION: 'Bearer token-externo-1',
      aUtHoRiZaTiOn: 'Bearer token-externo-2',
      authorization: 'Bearer token-externo-3',
      'X-Application-Id': '11',
    },
  }
  expect(await adminRequest('/shared/workers', options)).toEqual({ ok: true })
  const sentHeaders = fetch.mock.calls[0][1].headers
  expect(Object.keys(sentHeaders).filter(name => name.toLowerCase() === 'authorization')).toEqual(['Authorization'])
  expect(sentHeaders.Authorization).toBe('Bearer A')
  expect(sentHeaders['X-Application-Id']).toBe('11')
})


test.each(['GET', 'PUT'])('%s com HeadersInit em pares preserva application-id e isola cache/deduplicação', async method => {
  const pendingA = deferred()
  const pendingB = deferred()
  fetch.mockReturnValueOnce(pendingA.promise).mockReturnValueOnce(pendingB.promise)
  const { adminRequest } = api()
  localStorage.setItem(KEY, 'A')
  const base = method === 'GET' ? { cacheMs: 60000 } : { method, body: '{"enabled":true}' }
  const first = adminRequest('/shared/workers', {
    ...base,
    headers: [['X-Application-Id', '11'], ['AUTHORIZATION', 'Bearer externo A']],
  })
  const second = adminRequest('/shared/workers', {
    ...base,
    headers: [['x-application-id', '22'], ['authorization', 'Bearer externo B']],
  })
  expect(fetch).toHaveBeenCalledTimes(2)
  for (const [index, id] of [[0, '11'], [1, '22']]) {
    const headers = fetch.mock.calls[index][1].headers
    expect(Object.keys(headers).filter(name => name.toLowerCase() === 'authorization')).toEqual(['Authorization'])
    expect(headers.Authorization).toBe('Bearer A')
    expect(Object.entries(headers).some(([name, value]) => name.toLowerCase() === 'x-application-id' && value === id)).toBe(true)
  }
  pendingB.resolve(reply(200, { owner: 'B' }))
  pendingA.resolve(reply(200, { owner: 'A' }))
  expect(await second).toEqual({ owner: 'B' })
  expect(await first).toEqual({ owner: 'A' })
  if (method === 'GET') {
    expect(await adminRequest('/shared/workers', { cacheMs: 60000, headers: { 'x-application-id': '11' } })).toEqual({ owner: 'A' })
    expect(await adminRequest('/shared/workers', { cacheMs: 60000, headers: { 'X-Application-Id': '22' } })).toEqual({ owner: 'B' })
    expect(fetch).toHaveBeenCalledTimes(2)
  }
})

test('Headers com entries/forEach compartilha escopo com objeto equivalente sem perder app_id', async () => {
  const { adminRequest } = api()
  localStorage.setItem(KEY, 'A')
  const headers = {
    entries: () => [['X-Application-Id', '33'], ['AUTHORIZATION', 'Bearer externo']][Symbol.iterator](),
    forEach: () => {},
  }
  fetch.mockResolvedValueOnce(reply(200, { owner: 'A33' }))
  expect(await adminRequest('/shared/workers', { cacheMs: 60000, headers })).toEqual({ owner: 'A33' })
  expect(fetch.mock.calls[0][1].headers['X-Application-Id']).toBe('33')
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer A')
  expect(await adminRequest('/shared/workers', { cacheMs: 60000, headers: { 'x-application-id': '33' } })).toEqual({ owner: 'A33' })
  expect(fetch).toHaveBeenCalledTimes(1)
})


test.each([
  ['X-Application-Id', '/shared/search?q=a', '/shared/search?q=b', { 'X-Application-Id': '11' }, { 'X-Application-Id': '22' }],
  ['slug da rota', '/v1/apps/alpha/admin/search?q=a', '/v1/apps/beta/admin/search?q=b', {}, {}],
])('cancelKey igual não aborta leitura de outro app identificada por %s', async (_, pathA, pathB, headersA, headersB) => {
  const pendingA = deferred()
  const pendingB = deferred()
  fetch.mockReturnValueOnce(pendingA.promise).mockReturnValueOnce(pendingB.promise)
  const { adminRequest } = api()
  localStorage.setItem(KEY, 'A')
  const first = adminRequest(pathA, { cancelKey: 'search', headers: headersA })
  const second = adminRequest(pathB, { cancelKey: 'search', headers: headersB })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(false)
  expect(fetch.mock.calls[1][1].signal.aborted).toBe(false)
  pendingA.resolve(reply(200, { app: 'alpha' }))
  pendingB.resolve(reply(200, { app: 'beta' }))
  expect(await first).toEqual({ app: 'alpha' })
  expect(await second).toEqual({ app: 'beta' })
})

test('cancelKey ainda substitui busca anterior da mesma aplicação', async () => {
  fetch.mockImplementationOnce((_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Cancelada', 'AbortError')), { once: true })
  })).mockResolvedValueOnce(reply(200, { current: true }))
  const { adminRequest } = api()
  localStorage.setItem(KEY, 'A')
  const first = adminRequest('/v1/apps/alpha/admin/search?q=1', { cancelKey: 'search' }).catch(error => error)
  const second = adminRequest('/v1/apps/alpha/admin/search?q=2', { cancelKey: 'search' })
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
  expect((await first).name).toBe('AbortError')
  expect(await second).toEqual({ current: true })
})

test('cancelAdminRequest cancela apenas o escopo explícito da aplicação', async () => {
  fetch.mockImplementationOnce((_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Cancelada', 'AbortError')), { once: true })
  }))
  const { adminRequest, cancelAdminRequest } = api()
  localStorage.setItem(KEY, 'A')
  const path = '/v1/apps/alpha/admin/search?q=1'
  const headers = { 'X-Application-Id': '11' }
  const pending = adminRequest(path, { cancelKey: 'search', headers }).catch(error => error)
  expect(cancelAdminRequest('search', { path, headers: { 'x-application-id': '22' } })).toBe(false)
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(false)
  expect(cancelAdminRequest('search', { path, headers })).toBe(true)
  expect((await pending).name).toBe('AbortError')
})
