/** The Settings navigation entry that leaves Settings for the 科研插件 page (KEP-0008). */
import { useEffect, type ReactNode } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the `settings.section` declaration this entry registers into.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'

/** What the entry receives from the registration. */
export interface ResearchSettingsLinkInjected {
  /** Close Settings and open the 科研插件 page. */
  readonly openResearch: () => void
}

/** Full component props assembled by the settings shell. */
export type ResearchSettingsLinkProps = PropsRuntime<'settings.section'> & InjectFace<ResearchSettingsLinkInjected>

/**
 * Selecting the entry closes Settings and opens the 科研插件 page; the entry has no page of its own.
 * @param props - the shell's close action and the injected navigation.
 * @returns nothing; the entry renders no content.
 */
export function ResearchSettingsLink({ close, openResearch }: ResearchSettingsLinkProps): ReactNode {
  // Mounting is the selection: the shell mounts a page only when its navigation entry is chosen.
  useEffect(() => {
    close()
    openResearch()
  }, [close, openResearch])
  return null
}
