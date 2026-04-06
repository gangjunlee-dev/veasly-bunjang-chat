/**
 * 모니터링 핵심 로직 - Cloudflare Workers용 v5.0
 * =================================================
 * v5.0 개선사항:
 * - BUN 토큰 헬스체크 + 만료 시 긴급 알림
 * - Firebase 토큰 조건부 갱신 (50분 미경과 시 스킵)
 * - Talk API 병렬 호출 (배치 5개 동시)
 * - KV 데이터 분산 + 비활성 채널 자동 아카이브
 * - 구조화된 로그 시스템 (일별 분리 + 레벨 + 7일 보관)
 */

// ── Firebase 설정 ──
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAyQ8EtBrYnr5Oenj3Rl4-axLtb7uszHdA',
  projectId: 'bun-talk2-seoul-prod',
}

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`

// ── 타입 정의 ──
interface MonitorConfig {
  firebase_id_token?: string
  firebase_refresh_token?: string
  firebase_uid?: string
  telegram_bot_token?: string
  telegram_chat_id?: string
  slack_webhook_url?: string
  ignore_keywords?: string[]
  token_updated_at?: string
  bun_auth_token?: string
  talk_id_token?: string
  talk_token_refreshed_at?: string
  bun_token_updated_at?: string
  bun_token_expires_at?: string
  bun_token_expiry_warned?: boolean
}

interface ChatState {
  known: Record<string, { msg: string; ts: string; last_msg_id?: string; last_msg_ts?: string; other_id?: string; sender_id?: string }>
  last_poll: string
}

interface MonitorResult {
  status: string
  new_messages: number
  total_chats: number
  errors: string[]
}

interface ParsedMessage {
  id: string
  content: string
  created_at: string
  sender_id: string
}

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'REPLY' | 'POLL' | 'TOKEN' | 'INIT'

interface LogEntry {
  ts: string
  level: LogLevel
  msg: string
  meta?: Record<string, any>
}

// ══════════════════════════════════════════════════
// ── 로그 시스템 v2 (일별 분리 + 구조화) ──
// ══════════════════════════════════════════════════
async function appendLogV2(
  kv: KVNamespace,
  level: LogLevel,
  msg: string,
  meta?: Record<string, any>
): Promise<void> {
  const now = new Date()
  const entry: LogEntry = {
    ts: now.toISOString(),
    level,
    msg,
    meta,
  }

  // 1. 일별 로그 (상세, 1000건, 7일 자동 만료)
  const dateKey = `logs:${now.toISOString().slice(0, 10)}`
  const dailyLogs: LogEntry[] = (await kv.get(dateKey, 'json')) || []
  dailyLogs.unshift(entry)
  if (dailyLogs.length > 1000) dailyLogs.length = 1000
  await kv.put(dateKey, JSON.stringify(dailyLogs), { expirationTtl: 7 * 24 * 60 * 60 })

  // 2. 최근 로그 (대시보드용, 기존 형식 호환, 500건으로 확대)
  const recentLogs: string[] = (await kv.get('logs', 'json')) || []
  const timestamp = entry.ts.replace('T', ' ').slice(0, 19)
  const prefix = level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : level === 'REPLY' ? '↩️' : level === 'TOKEN' ? '🔑' : ''
  recentLogs.unshift(`[${timestamp}] [${level}] ${prefix} ${msg}`)
  if (recentLogs.length > 500) recentLogs.length = 500
  await kv.put('logs', JSON.stringify(recentLogs))
}

// 기존 appendLog 하위호환 래퍼
async function appendLog(kv: KVNamespace, entry: string) {
  const levelMatch = entry.match(/^\[(\w+)\]/)
  const rawLevel = levelMatch?.[1] || 'INFO'
  const levelMap: Record<string, LogLevel> = {
    'SKIP': 'WARN', 'ERROR': 'ERROR', 'INIT': 'INIT',
    'POLL': 'POLL', 'REPLY': 'REPLY', 'TOKEN': 'TOKEN',
    'NEW': 'INFO', 'PRUNE': 'INFO',
  }
  const level: LogLevel = levelMap[rawLevel] || 'INFO'
  const msg = entry.replace(/^\[\w+\]\s*/, '')
  await appendLogV2(kv, level, msg)
}

// ══════════════════════════════════════════════════
// ── KV 안전 쓰기 + 데이터 관리 ──
// ══════════════════════════════════════════════════
async function safeKvPut(
  kv: KVNamespace,
  key: string,
  value: any,
  maxRetries: number = 2
): Promise<boolean> {
  const json = JSON.stringify(value)
  const sizeKB = json.length / 1024

  if (sizeKB > 512) {
    await appendLogV2(kv, 'WARN', `KV ${key} 크기 경고: ${sizeKB.toFixed(1)}KB`)
  }

  for (let i = 0; i <= maxRetries; i++) {
    try {
      await kv.put(key, json)
      return true
    } catch (e) {
      if (i === maxRetries) {
        await appendLogV2(kv, 'ERROR', `KV ${key} 쓰기 실패 (${maxRetries + 1}회 시도)`)
        return false
      }
      await new Promise(r => setTimeout(r, 100 * (i + 1)))
    }
  }
  return false
}

function pruneStaleChannels(
  state: ChatState,
  activeChannelIds: Set<string>,
  maxInactive: number = 50
): { pruned: number; archived: Record<string, any> } {
  const allChannels = Object.keys(state.known)
  const archived: Record<string, any> = {}
  let pruned = 0

  const inactiveChannels = allChannels
    .filter(cid => !activeChannelIds.has(cid))
    .sort((a, b) => {
      const tsA = state.known[a]?.ts || ''
      const tsB = state.known[b]?.ts || ''
      return tsA.localeCompare(tsB)
    })

  if (inactiveChannels.length > maxInactive) {
    const toRemove = inactiveChannels.slice(0, inactiveChannels.length - maxInactive)
    for (const cid of toRemove) {
      archived[cid] = state.known[cid]
      delete state.known[cid]
      pruned++
    }
  }

  return { pruned, archived }
}

// ══════════════════════════════════════════════════
// ── Firebase 토큰 조건부 갱신 ──
// ══════════════════════════════════════════════════
function isTokenExpiringSoon(tokenUpdatedAt?: string): boolean {
  if (!tokenUpdatedAt) return true
  const updatedAt = new Date(tokenUpdatedAt).getTime()
  const now = Date.now()
  const elapsed = now - updatedAt
  const REFRESH_THRESHOLD = 50 * 60 * 1000 // 50분
  return elapsed >= REFRESH_THRESHOLD
}

async function refreshIdToken(refreshToken: string): Promise<{ id_token: string; refresh_token: string; uid: string } | null> {
  try {
    const resp = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
      }
    )
    if (!resp.ok) return null
    const data: any = await resp.json()
    return {
      id_token: data.id_token,
      refresh_token: data.refresh_token,
      uid: data.user_id,
    }
  } catch {
    return null
  }
}

// ══════════════════════════════════════════════════
// ── BUN 토큰 헬스체크 + 만료 알림 ──
// ══════════════════════════════════════════════════
async function checkBunTokenHealth(
  config: MonitorConfig,
  kv: KVNamespace,
  errors: string[]
): Promise<'ok' | 'expired'> {
  if (!config.bun_auth_token) return 'expired'

  try {
    const resp = await fetch('https://api.bunjang.co.kr/api/talk/v3/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BUN-AUTH-TOKEN': config.bun_auth_token,
      },
      body: JSON.stringify({ region: 'SEOUL' }),
    })

    if (resp.status === 401 || resp.status === 403) {
      await sendTokenExpiryAlert(config, kv, errors)
      await appendLogV2(kv, 'TOKEN', '⚠️ BUN Auth Token 만료됨! start.bat 재실행 필요')
      return 'expired'
    }

    const data: any = await resp.json()
    if (data?.data?.idToken) {
      config.talk_id_token = data.data.idToken
      config.talk_token_refreshed_at = new Date().toISOString()
      config.bun_token_expiry_warned = false
      await kv.put('config', JSON.stringify(config))
      return 'ok'
    }
  } catch {}

  return 'expired'
}

async function sendTokenExpiryAlert(
  config: MonitorConfig,
  kv: KVNamespace,
  errors: string[]
): Promise<void> {
  if (config.bun_token_expiry_warned) return

  const telegramText = `🚨 <b>[번개장터 모니터 긴급]</b>\nBUN 토큰 만료! 답장 기능 중단됨\n\n👉 로컬 PC에서 start.bat을 실행하여 토큰을 재등록하세요`
  const slackText = `🚨 *[번개장터 모니터 긴급]*\nBUN 토큰 만료! 답장 기능 중단됨\n\n👉 로컬 PC에서 start.bat을 실행하여 토큰을 재등록하세요`

  if (config.telegram_bot_token && config.telegram_chat_id) {
    await sendTelegram(config.telegram_bot_token, config.telegram_chat_id, telegramText)
  }
  if (config.slack_webhook_url) {
    await sendSlack(config.slack_webhook_url, slackText)
  }

  config.bun_token_expiry_warned = true
  await kv.put('config', JSON.stringify(config))
}

// ── Firestore 값 파싱 ──
function parseFirestoreValue(val: any): any {
  if (!val) return null
  if ('stringValue' in val) return val.stringValue
  if ('integerValue' in val) return parseInt(val.integerValue)
  if ('booleanValue' in val) return val.booleanValue
  if ('timestampValue' in val) return val.timestampValue
  if ('nullValue' in val) return null
  if ('mapValue' in val) {
    const fields = val.mapValue?.fields || {}
    const result: any = {}
    for (const [k, v] of Object.entries(fields)) {
      result[k] = parseFirestoreValue(v)
    }
    return result
  }
  if ('arrayValue' in val) {
    return (val.arrayValue?.values || []).map(parseFirestoreValue)
  }
  return String(val)
}

// ── 채팅 채널 조회 (Firestore) ──
async function fetchChatChannels(uid: string, idToken: string): Promise<any[]> {
  const url = `${FIRESTORE_BASE}/users/${uid}/channels?orderBy=last_messaged_at%20desc&pageSize=30`
  const resp = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (resp.status === 401 || resp.status === 403) {
    throw new Error('TOKEN_EXPIRED')
  }
  if (!resp.ok) {
    throw new Error(`Firestore ${resp.status}`)
  }

  const data: any = await resp.json()
  const documents = data.documents || []

  return documents.map((doc: any) => {
    const fields = doc.fields || {}
    const channel: any = {
      channel_id: doc.name?.split('/').pop() || '',
    }
    for (const [key, val] of Object.entries(fields)) {
      channel[key] = parseFirestoreValue(val as any)
    }
    return channel
  })
}

// ── Talk API로 메시지 조회 ──
async function fetchTalkMessages(
  targetUid: string,
  config: MonitorConfig,
  kv: KVNamespace,
): Promise<ParsedMessage[]> {
  if (!config.bun_auth_token) return []

  let talkToken = config.talk_id_token || ''

  if (!talkToken) {
    talkToken = await refreshTalkToken(config, kv)
    if (!talkToken) return []
  }

  const headers: Record<string, string> = {
    'X-BUN-AUTH-TOKEN': config.bun_auth_token!,
    'X-BUN-TALK-ID-TOKEN': talkToken,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://talk.bunjang.co.kr/',
  }

  let resp = await fetch(`https://api.bunjang.co.kr/api/talk/v3/messages?targetUid=${targetUid}&size=20`, { headers })

  if (resp.status === 401) {
    talkToken = await refreshTalkToken(config, kv)
    if (!talkToken) return []
    headers['X-BUN-TALK-ID-TOKEN'] = talkToken
    resp = await fetch(`https://api.bunjang.co.kr/api/talk/v3/messages?targetUid=${targetUid}&size=20`, { headers })
  }

  if (!resp.ok) return []

  const data: any = await resp.json()
  const rawMessages = data?.data || data?.messages || []

  const parsed = rawMessages.map((m: any) => ({
    id: String(m.id || ''),
    content: m.content || m.text || '',
    created_at: m.createdAt || m.created_at || '',
    sender_id: String(m.uid || m.senderId || m.sender_id || ''),
  })).filter((m: ParsedMessage) => m.content !== '')

  parsed.reverse()
  return parsed
}

// ── Talk Token 갱신 ──
async function refreshTalkToken(config: MonitorConfig, kv: KVNamespace): Promise<string> {
  if (!config.bun_auth_token) return ''
  try {
    const resp = await fetch('https://api.bunjang.co.kr/api/talk/v3/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BUN-AUTH-TOKEN': config.bun_auth_token,
      },
      body: JSON.stringify({ region: 'SEOUL' }),
    })
    const data: any = await resp.json()
    if (data?.data?.idToken) {
      config.talk_id_token = data.data.idToken
      config.talk_token_refreshed_at = new Date().toISOString()
      await kv.put('config', JSON.stringify(config))
      return data.data.idToken
    }
  } catch {}
  return ''
}

// ── 닉네임 조회 ──
async function fetchNickname(otherId: string, cache: Record<string, string>): Promise<string> {
  if (cache[otherId]) return cache[otherId]

  try {
    const resp = await fetch(
      `https://api.bunjang.co.kr/api/1/shop/${otherId}/cached_profile.json`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://m.bunjang.co.kr/',
        },
      }
    )
    if (resp.ok) {
      const data: any = await resp.json()
      const userName = data?.user_info?.basic?.user_name
      if (userName) {
        cache[otherId] = userName
        return userName
      }
    }
  } catch {}

  cache[otherId] = otherId
  return otherId
}

// ── 텔레그램 메시지 전송 ──
async function sendTelegram(botToken: string, chatId: string, text: string): Promise<boolean> {
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
    const result: any = await resp.json()
    return result.ok === true
  } catch {
    return false
  }
}

// ── Slack Webhook 전송 ──
async function sendSlack(webhookUrl: string, text: string): Promise<boolean> {
  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    return resp.ok
  } catch {
    return false
  }
}

// ── 알림 전송 (텔레그램 + 슬랙 동시) ──
async function sendNotifications(
  config: MonitorConfig,
  label: string,
  nickname: string,
  message: string,
  errors: string[]
): Promise<void> {
  const telegramText = `<b>[번개장터 ${label}]</b>\nFrom: <b>${nickname}</b>\n${message.slice(0, 200)}`
  const slackText = `*[번개장터 ${label}]*\nFrom: *${nickname}*\n${message.slice(0, 200)}`

  if (config.telegram_bot_token && config.telegram_chat_id) {
    const sent = await sendTelegram(config.telegram_bot_token, config.telegram_chat_id, telegramText)
    if (!sent) {
      errors.push(`텔레그램 전송 실패: ${nickname}`)
    }
  }

  if (config.slack_webhook_url) {
    const sent = await sendSlack(config.slack_webhook_url, slackText)
    if (!sent) {
      errors.push(`슬랙 전송 실패: ${nickname}`)
    }
  }
}

// ══════════════════════════════════════════════════
// ── 메인 모니터링 함수 v5.0 ──
// ══════════════════════════════════════════════════
export async function monitor(kv: KVNamespace): Promise<MonitorResult> {
  const result: MonitorResult = {
    status: 'ok',
    new_messages: 0,
    total_chats: 0,
    errors: [],
  }

  // 1. 설정 로드
  const config: MonitorConfig = (await kv.get('config', 'json')) || {} as any

  if (!config.firebase_refresh_token || !config.firebase_uid) {
    result.status = 'no_token'
    result.errors.push('Firebase 토큰 미설정')
    await appendLogV2(kv, 'WARN', '토큰 미설정 - 스킵')
    return result
  }

  // 1.5 BUN 토큰 헬스체크
  const bunHealth = await checkBunTokenHealth(config, kv, result.errors)
  if (bunHealth === 'expired') {
    result.errors.push('BUN Auth Token 만료 - 답장 불가')
  }

  // 2. Firebase 토큰 조건부 갱신 (50분 미경과 시 스킵)
  let idToken = config.firebase_id_token || ''
  const needsRefresh = !idToken || isTokenExpiringSoon(config.token_updated_at)

  if (needsRefresh) {
    const refreshed = await refreshIdToken(config.firebase_refresh_token)
    if (refreshed) {
      idToken = refreshed.id_token
      config.firebase_id_token = refreshed.id_token
      config.firebase_refresh_token = refreshed.refresh_token
      config.firebase_uid = refreshed.uid
      config.token_updated_at = new Date().toISOString()
      await kv.put('config', JSON.stringify(config))
      await appendLogV2(kv, 'TOKEN', 'Firebase 토큰 갱신 완료')
    } else {
      result.errors.push('토큰 갱신 실패')
      await appendLogV2(kv, 'ERROR', '토큰 갱신 실패')
      if (!idToken) {
        result.status = 'token_error'
        return result
      }
    }
  }

  // 3. 채팅 채널 조회 (Firestore)
  let channels: any[]
  try {
    channels = await fetchChatChannels(config.firebase_uid!, idToken)
  } catch (e: any) {
    if (e.message === 'TOKEN_EXPIRED') {
      // 토큰 만료 → 강제 갱신 1회 시도
      const refreshed = await refreshIdToken(config.firebase_refresh_token!)
      if (refreshed) {
        idToken = refreshed.id_token
        config.firebase_id_token = refreshed.id_token
        config.firebase_refresh_token = refreshed.refresh_token
        config.token_updated_at = new Date().toISOString()
        await kv.put('config', JSON.stringify(config))
        try {
          channels = await fetchChatChannels(config.firebase_uid!, idToken)
        } catch {
          result.status = 'token_expired'
          result.errors.push('토큰 만료 - 재로그인 필요')
          await appendLogV2(kv, 'ERROR', '토큰 만료 - 강제 갱신 후에도 실패')
          return result
        }
      } else {
        result.status = 'token_expired'
        result.errors.push('토큰 만료 - 재로그인 필요')
        await appendLogV2(kv, 'ERROR', '토큰 만료')
        return result
      }
    } else {
      result.errors.push(`Firestore 에러: ${e.message}`)
      await appendLogV2(kv, 'ERROR', `Firestore: ${e.message}`)
      return result
    }
  }

  result.total_chats = channels.length

  // 4. 상태 로드
  const state: ChatState = (await kv.get('chat_state', 'json')) || { known: {}, last_poll: '' } as any
  const nicknameCache: Record<string, string> = (await kv.get('nickname_cache', 'json')) || {}
  const ignoreKeywords: string[] = config.ignore_keywords || ['결제가 완료되었어요', '상품 준비중']

  const isFirstRun = Object.keys(state.known).length === 0
  const myUid = config.firebase_uid!

  // 5. 변경 감지 (변경된 채널만 필터링)
  interface ChangedChannel {
    ch: any
    cid: string
    lastMsg: string
    lastTs: string
    otherId: string
    prev: any
    targetUid: string
  }

  const changedChannels: ChangedChannel[] = []

  for (const ch of channels) {
    const cid = ch.channel_id || ''
    const lastMsg = String(ch.last_message_content || '')
    const lastTs = ch.last_messaged_at || ''
    const otherId = String(ch.other_id || '?')
    const prev = state.known[cid]

    if (isFirstRun) {
      state.known[cid] = { msg: lastMsg, ts: lastTs, other_id: otherId, sender_id: '' }
      continue
    }

    if (prev && prev.ts === lastTs && prev.msg === lastMsg) {
      continue
    }

    const parts = cid.split('_')
    const targetUid = parts.find((p: string) => p !== myUid) || otherId
    changedChannels.push({ ch, cid, lastMsg, lastTs, otherId, prev, targetUid })
  }

  // 6. Talk API 병렬 호출 (배치 5개 동시)
  const BATCH_SIZE = 5

  for (let i = 0; i < changedChannels.length; i += BATCH_SIZE) {
    const batch = changedChannels.slice(i, i + BATCH_SIZE)

    const [messageResults, nicknameResults] = await Promise.all([
      Promise.allSettled(
        batch.map(({ targetUid }) => fetchTalkMessages(targetUid, config, kv))
      ),
      Promise.allSettled(
        batch.map(({ otherId }) => fetchNickname(otherId, nicknameCache))
      ),
    ])

    for (let j = 0; j < batch.length; j++) {
      const { cid, lastMsg, lastTs, otherId, prev } = batch[j]

      const msgResult = messageResults[j]
      const messages: ParsedMessage[] = msgResult.status === 'fulfilled' ? msgResult.value : []

      const nickResult = nicknameResults[j]
      const nickname: string = nickResult.status === 'fulfilled' ? nickResult.value : otherId

      if (messages.length > 0) {
        const lastKnownMsgId = prev?.last_msg_id || ''
        const lastKnownMsgTs = prev?.last_msg_ts || ''

        let newMessages: ParsedMessage[] = []

        for (const m of messages) {
          if (lastKnownMsgId && m.id === lastKnownMsgId) break
          if (lastKnownMsgTs && m.created_at && m.created_at <= lastKnownMsgTs) break
          if (String(m.sender_id) === String(myUid)) continue
          if (ignoreKeywords.some((kw: string) => m.content.includes(kw))) continue
          newMessages.push(m)
        }

        newMessages.reverse()
        if (newMessages.length > 3) {
          newMessages = newMessages.slice(-3)
        }

        for (const m of newMessages) {
          const label = !prev ? 'NEW CHAT' : 'NEW MSG'
          await sendNotifications(config, label, nickname, m.content, result.errors)
          await appendLogV2(kv, 'INFO', `[${label}] ${nickname}: ${m.content.slice(0, 100)}`, {
            channel_id: cid, other_id: otherId,
          })
          result.new_messages++
        }

        const latestMsgId = messages[0].id
        const latestMsgTs = messages[0].created_at || ''
        const latestSenderId = messages[0].sender_id
        state.known[cid] = {
          msg: lastMsg, ts: lastTs,
          last_msg_id: latestMsgId, last_msg_ts: latestMsgTs,
          other_id: otherId, sender_id: latestSenderId,
        }

      } else {
        if (ignoreKeywords.some((kw: string) => lastMsg.includes(kw))) {
          state.known[cid] = { msg: lastMsg, ts: lastTs, other_id: otherId, sender_id: '' }
          continue
        }

        if (config.bun_auth_token) {
          state.known[cid] = { msg: lastMsg, ts: lastTs, other_id: otherId, sender_id: prev?.sender_id || '' }
          continue
        }

        const label = !prev ? 'NEW CHAT' : 'NEW MSG'
        await sendNotifications(config, label, nickname, lastMsg, result.errors)
        await appendLogV2(kv, 'INFO', `[${label}] ${nickname}: ${lastMsg.slice(0, 100)}`, {
          channel_id: cid, other_id: otherId, fallback: true,
        })
        result.new_messages++
        state.known[cid] = { msg: lastMsg, ts: lastTs, other_id: otherId, sender_id: '' }
      }
    }
  }

  // 7. 상태 저장 (비활성 채널 정리 + 안전 쓰기)
  state.last_poll = new Date().toISOString()

  const activeChannelIds = new Set(channels.map((ch: any) => ch.channel_id || ''))
  const { pruned, archived } = pruneStaleChannels(state, activeChannelIds)

  if (pruned > 0) {
    const existingArchive: any = (await kv.get('chat_state_archive', 'json')) || {}
    const mergedArchive = { ...existingArchive, ...archived }
    const archiveKeys = Object.keys(mergedArchive)
    if (archiveKeys.length > 200) {
      const sorted = archiveKeys.sort((a, b) => {
        const tsA = mergedArchive[a]?.ts || ''
        const tsB = mergedArchive[b]?.ts || ''
        return tsA.localeCompare(tsB)
      })
      for (const k of sorted.slice(0, archiveKeys.length - 200)) {
        delete mergedArchive[k]
      }
    }
    await safeKvPut(kv, 'chat_state_archive', mergedArchive)
    await appendLogV2(kv, 'INFO', `${pruned}개 비활성 채널 아카이브`)
  }

  await safeKvPut(kv, 'chat_state', state)
  await safeKvPut(kv, 'nickname_cache', nicknameCache)

  if (isFirstRun) {
    await appendLogV2(kv, 'INIT', `${channels.length}개 채팅방 초기 로드 완료`)
  } else if (result.new_messages > 0) {
    await appendLogV2(kv, 'POLL', `${result.new_messages}건 새 메시지 (총 ${channels.length}개 채팅방)`)
  }

  return result
}
