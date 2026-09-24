import { optimizedMediaUrl } from '../discoveryApi.js'

const widths = [320, 480, 640, 960, 1280, 1600]

function imageFile(files = []) {
  return files.find(file => file?.is_primary && (file.type === 'image' || String(file.mime_type || '').startsWith('image/')))
    || files.find(file => file?.type === 'image' || String(file?.mime_type || '').startsWith('image/'))
}

function srcSet(uuid, format) {
  return widths.map(width => `${optimizedMediaUrl(uuid, { width, format })} ${width}w`).join(', ')
}

export default function SmartImage({ files, src, alt = '', className, eager = false, sizes = '(max-width: 720px) 100vw, 50vw', width, height }) {
  const file = imageFile(files)
  const fallback = src || file?.public_url || ''
  if (!file?.uuid) {
    return <img src={fallback} alt={alt} className={className} loading={eager ? 'eager' : 'lazy'} decoding="async" fetchPriority={eager ? 'high' : 'auto'} width={width} height={height} />
  }

  return <picture>
    <source type="image/avif" srcSet={srcSet(file.uuid, 'avif')} sizes={sizes} />
    <source type="image/webp" srcSet={srcSet(file.uuid, 'webp')} sizes={sizes} />
    <img src={fallback || optimizedMediaUrl(file.uuid, { width: 960, format: 'auto' })} srcSet={srcSet(file.uuid, 'auto')} sizes={sizes} alt={alt} className={className} loading={eager ? 'eager' : 'lazy'} decoding="async" fetchPriority={eager ? 'high' : 'auto'} width={width || file.width || undefined} height={height || file.height || undefined} />
  </picture>
}
