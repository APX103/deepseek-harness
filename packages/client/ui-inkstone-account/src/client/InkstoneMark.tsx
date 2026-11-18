/**
 * The Inkstone brand assets from the intern-inkstone design system
 * (`@inkstone/elements` app-brand-logo): the 端砚 mascot mark. SVG keeps its
 * brand fills, so it renders as an <img> in both color schemes.
 */
import markUrl from './assets/inkstone-mark.svg'

/** The brand mark asset URL, emitted under `lib/assets` by the client build. */
export const INKSTONE_MARK_URL = markUrl

/**
 * Render the mark at one square edge, preserving the host's geometry class.
 * @param props - Requested square edge in pixels and the host class.
 * @returns the mark image.
 */
export function InkstoneMark({ size, className }: { size: number; className?: string | undefined }) {
  return <img className={className} src={INKSTONE_MARK_URL} width={size} height={size} alt="" draggable={false} />
}
