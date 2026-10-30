import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

jest.mock('../adminApi.js', () => ({
  adminRequest: jest.fn(),
}))

import { adminRequest } from '../adminApi.js'
import App from '../App.jsx'

const TOKEN_KEY = 'petertecnet_admin_token'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  localStorage.clear()
  adminRequest.mockReset()
})

// Regressões P0 deliberadamente exigentes: não flexibilizar o contrato para
// deixar o CI verde. A correção de App.jsx depende de cessão do owner NP11.
test('401 de /auth/me da sessão A não remove token B durante troca de abas', async () => {
  const oldSession = deferred()
  const newSession = deferred()
  let validations = 0
  localStorage.setItem(TOKEN_KEY, 'sessao-A')
  adminRequest.mockImplementation(path => {
    if (path === '/auth/me') return ++validations === 1 ? oldSession.promise : newSession.promise
    return Promise.resolve({})
  })

  render(<App />)
  await waitFor(() => expect(validations).toBe(1))

  await act(async () => {
    localStorage.setItem(TOKEN_KEY, 'sessao-B')
    window.dispatchEvent(new StorageEvent('storage', {
      key: TOKEN_KEY, oldValue: 'sessao-A', newValue: 'sessao-B',
    }))
  })
  await waitFor(() => expect(validations).toBe(2))

  await act(async () => {
    oldSession.reject({ status: 401 })
    await Promise.resolve()
  })

  expect(localStorage.getItem(TOKEN_KEY)).toBe('sessao-B')
})

test('erro de login A após login em outra aba não revoga a sessão B', async () => {
  const oldLogin = deferred()
  const newSession = deferred()
  adminRequest.mockImplementation(path => {
    if (path === '/account/identity/providers') return Promise.resolve({ google: { enabled: false } })
    if (path === '/auth/login') return oldLogin.promise
    if (path === '/auth/me') return newSession.promise
    return Promise.resolve({})
  })

  render(<App />)
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-de-teste' } })
  fireEvent.click(screen.getByRole('button', { name: /Acessar dashboard/i }))
  await waitFor(() => {
    expect(adminRequest.mock.calls.some(([path]) => path === '/auth/login')).toBe(true)
  })

  await act(async () => {
    localStorage.setItem(TOKEN_KEY, 'sessao-B')
    window.dispatchEvent(new StorageEvent('storage', {
      key: TOKEN_KEY, oldValue: null, newValue: 'sessao-B',
    }))
  })
  await waitFor(() => {
    expect(adminRequest.mock.calls.some(([path]) => path === '/auth/me')).toBe(true)
  })

  await act(async () => {
    oldLogin.reject({ status: 401, message: 'Falha de autenticação anterior' })
    await Promise.resolve()
  })

  expect(localStorage.getItem(TOKEN_KEY)).toBe('sessao-B')
})

test('403 obsoleto de /auth/me da sessão A não revoga token B', async () => {
  const oldSession = deferred()
  const newSession = deferred()
  let validations = 0
  localStorage.setItem(TOKEN_KEY, 'sessao-A')
  adminRequest.mockImplementation(path => {
    if (path === '/auth/me') return ++validations === 1 ? oldSession.promise : newSession.promise
    return Promise.resolve({})
  })

  render(<App />)
  await waitFor(() => expect(validations).toBe(1))

  await act(async () => {
    localStorage.setItem(TOKEN_KEY, 'sessao-B')
    window.dispatchEvent(new StorageEvent('storage', {
      key: TOKEN_KEY, oldValue: 'sessao-A', newValue: 'sessao-B',
    }))
  })
  await waitFor(() => expect(validations).toBe(2))

  await act(async () => {
    oldSession.reject({ status: 403, message: 'Permissão revogada na sessão A' })
    await Promise.resolve()
  })

  expect(localStorage.getItem(TOKEN_KEY)).toBe('sessao-B')
})
