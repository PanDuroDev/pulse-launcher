import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

export function useInView<T extends Element>(
  rootMargin = '500px',
  targetRef?: RefObject<T | null>,
): [RefObject<T | null>, boolean] {
  const localRef = useRef<T | null>(null)
  const ref = targetRef ?? localRef
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref, rootMargin])

  return [ref, visible]
}
