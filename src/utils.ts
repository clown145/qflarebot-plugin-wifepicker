import { qqAvatar, type Session } from '@qqbot/sdk'

/** 获取北京时间（UTC+8）的当前日期字符串，格式 YYYY-MM-DD */
export function getBeijingDateString(timestamp: number = Date.now()): string {
  // 加上 8 小时偏移取 ISO 字符串
  const beijingTime = new Date(timestamp + 8 * 3600 * 1000)
  return beijingTime.toISOString().slice(0, 10)
}

/** 获取 QQ 官方机器人体系下的用户 640px 头像 CDN 地址（对齐 @qqbot/sdk qqAvatar 规范） */
export function getAvatarUrl(botId: string, openid: string): string {
  return qqAvatar(botId, openid, 640)
}

/** 格式化毫秒数为人类可读的倒计时文本（如 2天5小时30分 / 15分20秒） */
export function formatRemainingTime(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const mins = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60

  if (days > 0) return `${days}天${hours}小时${mins}分`
  if (hours > 0) return `${hours}小时${mins}分`
  if (mins > 0) return `${mins}分${secs}秒`
  return `${secs}秒`
}

/** 平台原始 mentions 里的一项：群消息是 member_openid / nickname（没有 id），频道是 id / username */
interface RawMention {
  id?: unknown
  member_openid?: unknown
  user_openid?: unknown
  nickname?: unknown
  username?: unknown
  bot?: unknown
  is_you?: unknown
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * 从 session 中提取提及（@）的目标用户。
 * 1. 平台给的 mentions（群消息可能是 id / username，也可能是 member_openid / nickname，都读），标了 bot 或 is_you 的是机器人；
 * 2. mentions 里没有时退回正文里的 `<@openid>`：没开全量消息的群里「@机器人 强娶 @群友」，被 @ 的群友可能只在正文里。
 *    机器人在群里的 openid 和 AppID 不是一个，mentions 没标出来就认不出它，所以命令前面那一串 @ 当作在叫机器人、跳过
 */
export function extractTargetUser(session: Session): { userId: string; username: string } | null {
  const raw = session.raw as { content?: unknown; mentions?: unknown } | undefined
  const bots = new Set<string>([session.botId])
  const users: Array<{ userId: string; username: string }> = []
  const add = (id: string, name: string, bot: boolean) => {
    if (!id) return
    if (bot) bots.add(id)
    else users.push({ userId: id, username: name })
  }

  // 1. 原始推送的 mentions；2. 框架归一化过的 session.mentions（新版框架群里也读得到）
  for (const m of Array.isArray(raw?.mentions) ? (raw.mentions as RawMention[]) : []) {
    if (!m || typeof m !== 'object') continue
    add(str(m.member_openid) || str(m.id) || str(m.user_openid), str(m.nickname) || str(m.username), m.bot === true || m.is_you === true)
  }
  for (const m of session.mentions ?? []) add(m.id, m.username, m.bot)

  const found = users.find((u) => !bots.has(u.userId))
  if (found) {
    const named = users.find((u) => u.userId === found.userId && u.username)
    return { userId: found.userId, username: named?.username || `群友(${found.userId.slice(-4)})` }
  }

  // 3. mentions 里没有时退回正文里的 <@openid>，跳过已知的机器人和命令前面那一串 @
  const content = str(raw?.content)
  const head = /^(?:\s*<@!?[0-9A-Fa-f]{16,64}>)+/.exec(content)?.[0] ?? ''
  for (const match of content.slice(head.length).matchAll(/<@!?([0-9A-Fa-f]{16,64})>/g)) {
    const id = match[1]!
    if (!bots.has(id)) return { userId: id, username: `群友(${id.slice(-4)})` }
  }

  return null
}

/** 检查发言者是否为管理员或群主（优先使用 session.memberRole） */
export function isGroupAdmin(session: Session): boolean {
  if (session.memberRole === 'admin' || session.memberRole === 'owner') return true
  const raw = session.raw as Record<string, unknown> | undefined
  const author = raw?.author as Record<string, unknown> | undefined
  const role = String(author?.member_role ?? '').toLowerCase()
  return role === 'admin' || role === 'owner'
}
