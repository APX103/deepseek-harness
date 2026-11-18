/** Auth profile sanitizing: field fallbacks and the avatar URL guard. */
import { describe, expect, it } from 'vitest'
import { sanitizeAuthUser } from '../src/protocol.ts'

const base = { code: 0, data: { ssoUid: '20101151', username: 'user-1' } }

describe('sanitizeAuthUser', () => {
  it('passes a valid https avatar through', () => {
    const user = sanitizeAuthUser({ ...base, data: { ...base.data, avatar: 'https://img.example/a.png?size=64' } })
    expect(user.avatar).toBe('https://img.example/a.png?size=64')
  })

  it('treats the user-center default avatar and non-https URLs as absent', () => {
    expect(sanitizeAuthUser({ ...base, data: { ...base.data, avatar: 'https://pjlab-shanghai-moce.oss-cn-shanghai.aliyuncs.com/static/avatar/DefaultAvatar.svg' } }).avatar).toBeUndefined()
    expect(sanitizeAuthUser({ ...base, data: { ...base.data, avatar: 'http://img.example/a.png' } }).avatar).toBeUndefined()
    expect(sanitizeAuthUser({ ...base, data: { ...base.data, avatar: 'not a url' } }).avatar).toBeUndefined()
  })
})
