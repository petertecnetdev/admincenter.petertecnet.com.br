import { useEffect } from 'react'
import { blogArticles } from './marketingContent.js'
import { createAdminContent, fetchAdminContent, updateAdminContent } from './discoveryApi.js'

const SESSION_KEY = 'peter_content_api_migration_checked_v2'

function body(article) {
  const blocks = [article.intro]
  article.sections.forEach(section => {
    blocks.push(`## ${section.heading}`)
    ;(section.paragraphs || []).forEach(paragraph => blocks.push(paragraph))
    ;(section.bullets || section.points || []).forEach(point => blocks.push(`- ${typeof point === 'string' ? point : point?.text || point?.title || ''}`))
  })
  return blocks.filter(Boolean).join('\n\n')
}

function isPeterApplication(application) {
  const slug = String(application?.slug || '').trim().toLowerCase()
  const name = String(application?.name || '').trim().toLowerCase()
  return slug === 'peter-tecnet' || slug === 'petertecnet' || name === 'peter tecnet'
}

function isLegacyPeterArticle(entry) {
  return !entry?.application_id && entry?.type === 'article' && entry?.metadata?.migrated_from === 'marketingContent.js'
}

export default function ContentApiMigrationBridge() {
  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return undefined
    sessionStorage.setItem(SESSION_KEY, '1')
    let active = true

    const migrate = async () => {
      try {
        const payload = await fetchAdminContent({ type: 'article' })
        if (!active) return

        const data = payload?.data || {}
        const peterApplication = (data.applications || []).find(isPeterApplication)
        if (!peterApplication?.id) throw new Error('Aplicação Peter Tecnet não encontrada na API.')

        const entries = data.entries || []
        const peterEntries = entries.filter(entry => Number(entry.application_id) === Number(peterApplication.id))
        const existing = new Set(peterEntries.map(entry => entry.slug))
        let changed = false

        for (const entry of entries.filter(isLegacyPeterArticle)) {
          if (!active) break
          if (existing.has(entry.slug)) continue
          await updateAdminContent(entry.id, { application_id: peterApplication.id })
          existing.add(entry.slug)
          changed = true
        }

        for (const article of blogArticles.filter(candidate => !existing.has(candidate.slug))) {
          if (!active) break
          await createAdminContent({
            application_id: peterApplication.id,
            type: 'article',
            status: 'published',
            title: article.title,
            slug: article.slug,
            excerpt: article.description,
            content: body(article),
            category: article.category,
            tags: [article.category, article.relatedPlatform].filter(Boolean),
            cluster: article.relatedPlatform || String(article.category).toLocaleLowerCase('pt-BR').replace(/\s+/g, '-'),
            search_intent: article.title,
            seo_title: article.seoTitle,
            seo_description: article.description,
            metadata: { related_platform: article.relatedPlatform, migrated_from: 'marketingContent.js', migration_version: 2 },
          })
          existing.add(article.slug)
          changed = true
        }

        if (active && changed) window.dispatchEvent(new CustomEvent('peter:content-api-migrated'))
      } catch {
        sessionStorage.removeItem(SESSION_KEY)
      }
    }

    migrate()
    return () => { active = false }
  }, [])

  return null
}
