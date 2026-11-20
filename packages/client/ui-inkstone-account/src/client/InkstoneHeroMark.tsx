/**
 * The 书生 face in the blank-session hero: occupies
 * `conversation.hero.brand.mark` so the harness fallback whale stays off the
 * Inkstone product surface (KEP-0007 face: head + gold spark).
 */
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { InkstoneFaceMark } from './InkstoneFaceMark.tsx'

/**
 * @param props - Requested square edge and the host geometry class.
 * @returns the hero brand mark.
 */
export function InkstoneHeroMark({ size, className }: HeroBrandMarkOwnerProps) {
  return <InkstoneFaceMark size={size} className={className} spark />
}
