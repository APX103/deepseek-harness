/** Inkstone account UI dictionaries. */

export const NS = 'inkstone'

/** English Inkstone account messages. */
export const en = {
  'brand.name': '端砚 Inkstone',
  'menu.aria': 'Account menu',
  'menu.settings': 'Settings',
  'menu.uid': 'UID',
  'menu.signOut': 'Sign out',
  'balance.title': 'Inkstone balance (credits)',
  'balance.window.qualifier': '({window} window)',
  'label.signedOut': 'Not signed in',
  'gate.hint': 'The sign-in window opens on the desktop at startup; if it was closed, restart the app and sign in again.',
} satisfies Record<string, string>

/** Simplified Chinese Inkstone account messages. */
export const zh = {
  'brand.name': '端砚 Inkstone',
  'menu.aria': '账号菜单',
  'menu.settings': '设置',
  'menu.uid': 'UID',
  'menu.signOut': '退出登录',
  'balance.title': '墨点余额',
  'balance.window.qualifier': '（{window} 窗口）',
  'label.signedOut': '未登录',
  'gate.hint': '登录窗口已在桌面打开；若已关闭，请重启应用后再试',
} satisfies Record<keyof typeof en, string>

/** Translation keys owned by the Inkstone UI namespace. */
export type InkstoneKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Inkstone account launcher copy. */
    inkstone: InkstoneKey
  }
}
