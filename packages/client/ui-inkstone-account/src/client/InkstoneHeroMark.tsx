/**
 * The Inkstone mark in the blank-session hero: occupies
 * `conversation.hero.brand.mark` so the harness fallback whale stays off the
 * Inkstone product surface.
 */
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { InkstoneMark } from './InkstoneMark.tsx'

/**
 * @param props - Requested square edge and the host geometry class.
 * @returns the hero brand mark.
 */
export function InkstoneHeroMark({ size, className }: HeroBrandMarkOwnerProps) {
  return <InkstoneMark size={size} className={className} />
}
