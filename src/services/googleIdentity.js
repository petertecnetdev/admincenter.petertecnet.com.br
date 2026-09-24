let googleIdentityPromise

export function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id)
  if (googleIdentityPromise) return googleIdentityPromise

  googleIdentityPromise = new Promise((resolve, reject) => {
    const finish = () => {
      const identity = window.google?.accounts?.id
      if (identity) resolve(identity)
      else reject(new Error('O Google Identity não ficou disponível.'))
    }

    const existing = document.querySelector('script[data-admin-google-identity]')
    if (existing) {
      existing.addEventListener('load', finish, { once: true })
      existing.addEventListener('error', () => reject(new Error('Não foi possível carregar o login com Google.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.adminGoogleIdentity = 'true'
    script.addEventListener('load', finish, { once: true })
    script.addEventListener('error', () => reject(new Error('Não foi possível carregar o login com Google.')), { once: true })
    document.head.appendChild(script)
  }).catch(error => {
    googleIdentityPromise = null
    throw error
  })

  return googleIdentityPromise
}
