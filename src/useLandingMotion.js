import { useEffect } from 'react'

export default function useLandingMotion(active = true) {
  useEffect(() => {
    if (!active) return undefined

    const root = document.documentElement
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const tiltHandlers = new Map()
    let pointerFrame = 0
    let scrollFrame = 0
    let pointerX = 0
    let pointerY = 0

    const updatePointer = event => {
      pointerX = event.clientX
      pointerY = event.clientY
      if (pointerFrame) return
      pointerFrame = window.requestAnimationFrame(() => {
        pointerFrame = 0
        root.style.setProperty('--pointer-x', `${pointerX}px`)
        root.style.setProperty('--pointer-y', `${pointerY}px`)
      })
    }

    const updateScroll = () => {
      if (scrollFrame) return
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0
        const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1)
        root.style.setProperty('--scroll-progress', `${Math.min(window.scrollY / max, 1)}`)
      })
    }

    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          revealObserver.unobserve(entry.target)
        }
      })
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })

    const observeReveal = element => {
      if (!(element instanceof Element) || !element.matches('[data-reveal]')) return
      if (reduceMotion) element.classList.add('is-visible')
      else revealObserver.observe(element)
    }

    const attachTilt = element => {
      if (reduceMotion || !(element instanceof Element) || !element.matches('[data-tilt]') || tiltHandlers.has(element)) return

      const onMove = event => {
        const rect = element.getBoundingClientRect()
        const px = (event.clientX - rect.left) / Math.max(rect.width, 1)
        const py = (event.clientY - rect.top) / Math.max(rect.height, 1)
        element.style.setProperty('--tilt-x', `${(0.5 - py) * 7}deg`)
        element.style.setProperty('--tilt-y', `${(px - 0.5) * 8}deg`)
        element.style.setProperty('--glow-x', `${px * 100}%`)
        element.style.setProperty('--glow-y', `${py * 100}%`)
      }

      const onLeave = () => {
        element.style.setProperty('--tilt-x', '0deg')
        element.style.setProperty('--tilt-y', '0deg')
        element.style.setProperty('--glow-x', '50%')
        element.style.setProperty('--glow-y', '50%')
      }

      element.addEventListener('pointermove', onMove)
      element.addEventListener('pointerleave', onLeave)
      tiltHandlers.set(element, [onMove, onLeave])
    }

    const registerNode = node => {
      if (!(node instanceof Element)) return
      observeReveal(node)
      attachTilt(node)
      node.querySelectorAll('[data-reveal]').forEach(observeReveal)
      node.querySelectorAll('[data-tilt]').forEach(attachTilt)
    }

    document.querySelectorAll('[data-reveal]').forEach(observeReveal)
    document.querySelectorAll('[data-tilt]').forEach(attachTilt)

    const mutationObserver = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(registerNode))
      updateScroll()
    })
    mutationObserver.observe(document.body, { childList: true, subtree: true })

    updateScroll()
    window.addEventListener('scroll', updateScroll, { passive: true })
    window.addEventListener('resize', updateScroll, { passive: true })
    if (!reduceMotion) window.addEventListener('pointermove', updatePointer, { passive: true })

    return () => {
      mutationObserver.disconnect()
      revealObserver.disconnect()
      window.removeEventListener('scroll', updateScroll)
      window.removeEventListener('resize', updateScroll)
      window.removeEventListener('pointermove', updatePointer)
      if (pointerFrame) window.cancelAnimationFrame(pointerFrame)
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame)
      tiltHandlers.forEach(([onMove, onLeave], element) => {
        element.removeEventListener('pointermove', onMove)
        element.removeEventListener('pointerleave', onLeave)
      })
      tiltHandlers.clear()
    }
  }, [active])
}
