/** Inkstone account UI dictionaries. */

export const NS = 'inkstone'

/** English Inkstone account messages. */
export const en = {
  'brand.name': '书生·端砚',
  'menu.aria': 'Account menu',
  'menu.settings': 'Settings',
  'menu.uid': 'UID',
  'menu.signOut': 'Sign out',
  'balance.title': 'Inkstone balance (credits)',
  'balance.window.qualifier': '({window} window)',
  'plan.tab.ledger': 'Activity',
  'plan.tab.packages': 'Packages',
  'plan.tab.applications': 'Credit requests',
  'plan.ledger.empty': 'No credit activity in the last 30 days.',
  'plan.ledger.date': 'Date',
  'plan.ledger.type': 'Type',
  'plan.ledger.scene': 'Scenario',
  'plan.ledger.delta': 'Change',
  'plan.packages.empty': 'No credit packages.',
  'plan.packages.cycle': '{start} – {end}',
  'plan.packages.remaining': '{remaining} / {total}',
  'plan.applications.empty': 'No credit requests yet.',
  'plan.prev': 'Previous',
  'plan.next': 'Next',
  'plan.page': '{page} / {pages}',
  'label.signedOut': 'Not signed in',
  'gate.hint': 'The sign-in window opens on the desktop at startup; if it was closed, restart the app and sign in again.',
} satisfies Record<string, string>

/** Simplified Chinese Inkstone account messages. */
export const zh = {
  'brand.name': '书生·端砚',
  'menu.aria': '账号菜单',
  'menu.settings': '设置',
  'menu.uid': 'UID',
  'menu.signOut': '退出登录',
  'balance.title': '墨点余额',
  'balance.window.qualifier': '（{window} 窗口）',
  'plan.tab.ledger': '收支',
  'plan.tab.packages': '墨点包',
  'plan.tab.applications': '提额申请',
  'plan.ledger.empty': '近 30 天没有墨点变动。',
  'plan.ledger.date': '时间',
  'plan.ledger.type': '类型',
  'plan.ledger.scene': '业务场景',
  'plan.ledger.delta': '墨点变动',
  'plan.packages.empty': '没有墨点包。',
  'plan.packages.cycle': '{start} 至 {end}',
  'plan.packages.remaining': '剩余 {remaining} / 总量 {total}',
  'plan.applications.empty': '还没有提额申请。',
  'plan.prev': '上一页',
  'plan.next': '下一页',
  'plan.page': '{page} / {pages}',
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
