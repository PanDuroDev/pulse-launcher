import { useEffect, useState } from 'react'

export function useClock(): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  return now
}

export function useAutoHideCursor(delayMs: number): void {
  useEffect(() => {
    let timer = 0
    const root = document.documentElement

    const showCursor = (): void => {
      root.classList.remove('cursor-hidden')
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        root.classList.add('cursor-hidden')
      }, delayMs)
    }

    showCursor()
    window.addEventListener('mousemove', showCursor)
    window.addEventListener('mousedown', showCursor)

    return () => {
      window.clearTimeout(timer)
      root.classList.remove('cursor-hidden')
      window.removeEventListener('mousemove', showCursor)
      window.removeEventListener('mousedown', showCursor)
    }
  }, [delayMs])
}
