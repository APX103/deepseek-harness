/**
 * The Inkstone sidebar account launcher (KEP-0003): the signed-in avatar and
 * name, a menu carrying the UID and the sign-out action. The sign-out face
 * action clears the session and remounts the full-screen login gate.
 */
import { useState } from 'react'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { InkstoneAccountSource } from './account-source.ts'
import type { InkstoneBalanceSource } from './balance-source.ts'
import { bindingWindow } from './balance-source.ts'
import { NS } from './locales.ts'
import css from './InkstoneLauncher.module.css'

/** Inject face: the account snapshot source, the balance source, and the sign-out operation. */
export interface InkstoneLauncherFace {
  /** Account snapshot binding the renderer exposes as the `useAccount` hook. */
  readonly hooks: {
    readonly account: InkstoneAccountSource
    /** 墨点 balance binding the renderer exposes as the `useBalance` hook. */
    readonly balance: InkstoneBalanceSource
  }
  /** Fetch the 墨点 balance again; the menu calls this every time it opens. */
  readonly refreshBalance: () => void
  /** Sign out of the Inkstone account and remount the login gate. */
  readonly signOut: () => Promise<void>
}

/** Launcher props composed by the settings shell. */
export type InkstoneLauncherProps = PropsRuntime<'settings.launcher'> & PropsLocale<typeof NS> & InjectFace<InkstoneLauncherFace>

/**
 * @param props - sidebar geometry, the account snapshot hook, sign-out, and locale copy.
 * @returns the Inkstone account launcher row.
 */
export function InkstoneLauncher({
  wide, openSettings, settingsShortcut, useAccount, useBalance, refreshBalance, signOut, t,
}: InkstoneLauncherProps) {
  const account = useAccount(state => state)
  const balance = useBalance(value => value)
  const bound = bindingWindow(balance)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [avatarFailed, setAvatarFailed] = useState(false)
  const signedIn = account.status === 'signed-in' && account.user !== undefined
  const user = account.user
  const displayName = user?.nickname !== undefined && user.nickname !== '' ? user.nickname : (user?.username ?? t('label.signedOut'))
  const initial = displayName.slice(0, 1).toUpperCase()
  const requestSignOut = async (): Promise<void> => {
    setBusy(true)
    try { await signOut() }
    finally { setBusy(false) }
  }
  return (
    <div className={css.root}>
      <Menu
        open={open}
        side="top"
        portal
        autoFocus
        className={css.anchor}
        anchor={
          <button
            type="button"
            className={css.trigger}
            data-collapsed={!wide}
            aria-label={t('menu.aria')}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => {
              setOpen((value) => {
                if (!value) refreshBalance()
                return !value
              })
            }}
          >
            <span className={css.avatar}>
              {signedIn && user?.avatar !== undefined && !avatarFailed
                ? <img className={css.image} src={user.avatar} alt="" referrerPolicy="no-referrer"
                  onError={() => { setAvatarFailed(true) }} />
                : <span aria-hidden="true">{signedIn ? initial : '·'}</span>}
            </span>
            {wide && <span className={css.label}>{signedIn ? displayName : t('label.signedOut')}</span>}
          </button>
        }
        items={[
          // The launcher occupies the settings trigger row, so the menu keeps
          // the settings entry the row used to offer.
          { id: 'settings', label: t('menu.settings'),
            ...(settingsShortcut === undefined ? {} : { shortcut: settingsShortcut }) },
          ...(signedIn && user !== undefined
            ? [
              { id: 'uid', label: `${t('menu.uid')} ${user.ssoUid}`, disabled: true },
              ...(balance !== undefined
                ? [{
                  id: 'balance',
                  label: `${t('balance.title')} ${balance.effectiveCredits.toFixed(3)}`
                    + (bound !== undefined ? ` ${t('balance.window.qualifier', { window: bound.id })}` : ''),
                  disabled: true,
                }]
                : []),
            ]
            : []),
          { id: 'signout', label: t('menu.signOut'), disabled: busy || !signedIn },
        ]}
        onClose={() => { setOpen(false) }}
        onSelect={(id) => {
          if (id === 'settings') { setOpen(false); openSettings() }
          else if (id === 'signout') { setOpen(false); void requestSignOut() }
        }}
      />
    </div>
  )
}
