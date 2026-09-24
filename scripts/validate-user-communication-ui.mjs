import fs from 'node:fs'

const experience = fs.readFileSync(new URL('../src/AdminUserDetailExperience.jsx', import.meta.url), 'utf8')
const detailPage = fs.readFileSync(new URL('../src/AdminUserDetailPage.jsx', import.meta.url), 'utf8')
const users = fs.readFileSync(new URL('../src/AdminUsersCenter.jsx', import.meta.url), 'utf8')
const impersonation = fs.readFileSync(new URL('../src/AdminImpersonation.jsx', import.meta.url), 'utf8')

const checks = [
  ['user center mounts communication experience', users.includes("./AdminUserDetailExperience.jsx")],
  ['user list keeps direct impersonation action', users.includes('acu-simple-user__impersonate') && users.includes('setImpersonationUser(user)')],
  ['user list mounts impersonation dialog', users.includes('AdminImpersonationDialog') && users.includes('canImpersonate(user)')],
  ['impersonation accepts active applications identified by id', impersonation.includes("resolvedApplications.filter(app => app?.is_active !== false && app?.id)")],
  ['impersonation posts the selected application id', impersonation.includes('application_id: Number(applicationId)')],
  ['impersonation requires API handoff before navigation', impersonation.includes("if (!payload?.handoff_url) throw new Error") && impersonation.includes('popup.location.replace(payload.handoff_url)')],
  ['detail experience renders one shell', experience.includes('data-user-detail-experience="true"')],
  ['quick actions are injected into user detail header', experience.includes('detailActions={quickActions}') && detailPage.includes('detailActions = null')],
  ['detail header renders quick actions', detailPage.includes('aud-hero-actions') && detailPage.includes('{detailActions}')],
  ['combined communication action is visible', experience.includes('>Comunicar</button>')],
  ['impersonation action is visible in detail header', experience.includes('>Entrar como usuário</button>')],
  ['composer still supports email channel', experience.includes("email: 'E-mail'") && experience.includes("openComposer('both')")],
  ['composer still supports notification channel', experience.includes("notification: 'Notificação'")],
  ['individual email endpoint is wired', experience.includes('/communications/email')],
  ['notification endpoint is wired', experience.includes("'/admin/ecosystem/notifications'")],
]

let failed = false
for (const [label, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failed = true
}

if (failed) process.exit(1)
console.log('\nUser communication detail contract validated.')
