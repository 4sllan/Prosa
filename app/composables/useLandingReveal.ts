import type { Ref } from 'vue'
import '~/assets/css/landing-motion.css'

export function useLandingReveal(root: Readonly<Ref<HTMLElement | null>>) {
  let cleanup = () => {}

  onMounted(() => {
    const container = root.value
    if (!container || typeof IntersectionObserver !== 'function') return

    const elements = [...container.querySelectorAll<HTMLElement>('[data-landing-reveal]')]
    const pending = new Set(elements)
    let observer: IntersectionObserver | undefined
    let media: MediaQueryList | undefined

    const reveal = (element: HTMLElement, animate: boolean) => {
      element.dataset.revealState = animate ? 'revealed' : 'done'
      pending.delete(element)
      observer?.unobserve(element)
      if (!pending.size) observer?.disconnect()
    }
    const finish = () => {
      observer?.disconnect()
      pending.clear()
      for (const element of elements) element.dataset.revealState = 'done'
    }
    const onMotionChange = () => {
      if (media?.matches) finish()
    }
    const onFocus = (event: FocusEvent) => {
      if (!(event.target instanceof Node)) return
      for (const element of elements) {
        if (element.contains(event.target)) reveal(element, false)
      }
    }

    cleanup = () => {
      observer?.disconnect()
      media?.removeEventListener('change', onMotionChange)
      container.removeEventListener('focusin', onFocus)
      pending.clear()
      for (const element of elements) delete element.dataset.revealState
    }

    try {
      media = window.matchMedia('(prefers-reduced-motion: reduce)')
      if (media.matches) return

      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && pending.has(entry.target as HTMLElement)) {
            reveal(entry.target as HTMLElement, true)
          }
        }
      }, { threshold: 0 })

      media.addEventListener('change', onMotionChange)
      container.addEventListener('focusin', onFocus)
      // Arm only after observation succeeds; SSR and failed setup stay visible.
      for (const element of elements) observer.observe(element)
      for (const element of elements) element.dataset.revealState = 'pending'
      if (container.contains(document.activeElement)) {
        onFocus({ target: document.activeElement } as FocusEvent)
      }
    } catch {
      cleanup()
    }
  })

  onBeforeUnmount(() => cleanup())
}
