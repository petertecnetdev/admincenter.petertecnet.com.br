import { useEffect, useRef } from 'react'

const SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useDialogFocus(ref, active, onClose) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!active || !ref.current) return undefined
    const previous = document.activeElement
    const dialog = ref.current

    const focusable = () => [...dialog.querySelectorAll(SELECTOR)]
      .filter(node => node instanceof HTMLElement && !node.hidden && node.getAttribute('aria-hidden') !== 'true')

    const frame = window.requestAnimationFrame(() => {
      const nodes = focusable()
      ;(nodes[0] || dialog)?.focus?.()
    })

    const onKeyDown = event => {
      if (event.key === 'Escape' && closeRef.current) {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const nodes = focusable()
      if (!nodes.length) {
        event.preventDefault()
        dialog.focus?.()
        return
      }
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    dialog.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      dialog.removeEventListener('keydown', onKeyDown)
      if (previous instanceof HTMLElement && document.contains(previous)) {
        window.requestAnimationFrame(() => previous.focus())
      }
    }
  }, [active, ref])
}
