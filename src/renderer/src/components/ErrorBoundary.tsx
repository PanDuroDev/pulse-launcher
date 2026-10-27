import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import {
  ArrowLeftFilled,
  FileInfoFilled,
  Refresh2Filled,
  WarningFilled,
} from '@mingcute/react/core-filled'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation-react'
import { uiAccent } from '@/lib/accent'
import { cn } from 'cn'

interface BoundaryButtonProps {
  focusKey: string
  label: string
  onClick: () => void
  primary?: boolean
  icon: ReactNode
}

/**
 * The boundary renders outside the normal page tree, so it cannot rely on the
 * spatial-navigation graph being healthy. It still registers focusables because
 * a controller user has no other way to reach the buttons.
 */
function BoundaryButton({ focusKey, label, onClick, primary, icon }: BoundaryButtonProps) {
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey,
    accessibilityLabel: label,
    onEnterPress: onClick,
  })

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      data-focus-key={focusKey}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-full px-5 text-caption font-semibold outline-none transition-colors',
        primary
          ? 'bg-white text-black'
          : 'border border-white/15 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white',
      )}
      style={focused ? { boxShadow: `0 0 0 3px ${uiAccent(0.7)}` } : undefined}
    >
      {icon}
      {label}
    </button>
  )
}

interface ErrorBoundaryProps {
  children: ReactNode
  /** Names the surface so the fallback reads as a page failure, not a crash. */
  surface: 'launcher' | 'overlay'
  /** Where the retry should land: a full reload or just a re-render of the page. */
  onRetry?: () => void
  /**
   * A page-level boundary replaces the page, including its own Back button.
   * Without this the user would be stuck on the error screen.
   */
  onBack?: { label: string; onClick: () => void }
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Without a boundary a single renderer exception unmounts the whole React tree
 * and leaves a blank window: no navigation, no way to reach the logs. This
 * keeps the shell alive and turns the failure into something actionable.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // `console.error` alone is invisible in a packaged build; the main process
    // owns the log file, so the report goes over IPC.
    window.launcher?.app.reportRendererError({
      surface: this.props.surface,
      message: error.message,
      stack: error.stack ?? '',
      componentStack: info.componentStack ?? '',
    })
  }

  private retry = (): void => {
    this.setState({ error: null })
    this.props.onRetry?.()
  }

  private openLogs = (): void => {
    void window.launcher?.app.openLogs()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    const isOverlay = this.props.surface === 'overlay'
    const title = isOverlay ? 'The music overlay stopped' : 'Pulse hit an error'
    const body = isOverlay
      ? 'The overlay closed this panel to keep the launcher running. Your music keeps playing.'
      : 'This page could not be drawn. The rest of the launcher is still running.'

    return (
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8 text-center',
          isOverlay ? 'h-screen w-screen bg-[#0b0b10] p-4' : 'h-full',
        )}
      >
        <span className="grid size-12 place-items-center rounded-2xl bg-white/8 text-white/70">
          <WarningFilled className="size-6" />
        </span>
        <div className="max-w-md">
          <p className="text-label font-semibold text-white">{title}</p>
          <p className="mt-1.5 text-caption leading-relaxed text-white/55">{body}</p>
          <p className="mt-2 line-clamp-3 break-words text-caption leading-relaxed text-white/40">
            {error.message || 'No error message was provided.'}
          </p>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2.5">
          <BoundaryButton
            focusKey={isOverlay ? 'overlay-error-retry' : 'error-retry'}
            label="Try again"
            onClick={this.retry}
            primary
            icon={<Refresh2Filled className="size-4" />}
          />
          {this.props.onBack ? (
            <BoundaryButton
              focusKey="error-back"
              label={this.props.onBack.label}
              onClick={this.props.onBack.onClick}
              icon={<ArrowLeftFilled className="size-4" />}
            />
          ) : null}
          {isOverlay ? null : (
            <BoundaryButton
              focusKey="error-open-logs"
              label="Open logs"
              onClick={this.openLogs}
              icon={<FileInfoFilled className="size-4" />}
            />
          )}
        </div>
        {isOverlay ? null : (
          <p className="text-caption text-white/30">
            The details were written to the log file.
          </p>
        )}
      </div>
    )
  }
}
