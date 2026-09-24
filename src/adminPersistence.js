export function readAdminSessionState(key, fallback) {
  try {
    const raw = window.sessionStorage.getItem(`pt-admin:${key}`)
    if (!raw) return typeof fallback === 'function' ? fallback() : fallback
    const value = JSON.parse(raw)
    const base = typeof fallback === 'function' ? fallback() : fallback
    if (Array.isArray(base)) return Array.isArray(value) ? value : base
    if (base && typeof base === 'object') {
      const isPlainObject = value && typeof value === 'object' && !Array.isArray(value)
      return isPlainObject ? { ...base, ...value } : base
    }
    return value ?? base
  } catch {
    return typeof fallback === 'function' ? fallback() : fallback
  }
}

export function writeAdminSessionState(key, value) {
  try {
    window.sessionStorage.setItem(`pt-admin:${key}`, JSON.stringify(value))
  } catch {
    // Session persistence is an enhancement; quota/privacy failures must not break admin operation.
  }
}

export function clearAdminSessionState(key) {
  try {
    window.sessionStorage.removeItem(`pt-admin:${key}`)
  } catch {
    // Ignore storage restrictions.
  }
}
