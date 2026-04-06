/**
 * 번개장터 채팅 모니터 - Cloud Edition v5.0
 * =============================================
 * v5.0 개선사항:
 * - BUN 토큰 등록 시 만료 예상 시점 기록
 * - 일별 로그 조회 API 추가
 * - 로그 날짜 목록 API 추가
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { monitor } from './monitor'
import { DASHBOARD_HTML } from './dashboard'
import { GUIDE_HTML } from './guide'

type Bindings = {
  MONITOR_KV: KVNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}))

// ── 웹 대시보드 ──
app.get('/', (c) => {
  return c.html(DASHBOARD_HTML)
})

// ── 팀 가이드 ──
app.get('/guide', (c) => {
  return c.html(GUIDE_HTML)
})

// ── API 라우트 ──

// 설정 조회
app.get('/api/config', async (c) => {
  const config: any = await c.env.MONITOR_KV.get('config', 'json') || {}
  const safe = {
    ...config,
    firebase_id_token: config.firebase_id_token ? '***설정됨***' : '',
    firebase_refresh_token: config.firebase_refresh_token ? '***설정됨***' : '',
    telegram_bot_token: config.telegram_bot_token ? '***설정됨***' : '',
    slack_webhook_url: config.slack_webhook_url ? '***설정됨***' : '',
    bun_auth_token: config.bun_auth_token ? '***설정됨***' : '',
    talk_id_token: config.talk_id_token ? '***설정됨***' : '',
  }
  return c.json({ ok: true, config: safe })
})

// 설정 저장 (특수 값 __REMOVE__ 처리)
app.post('/api/config', async (c) => {
  const body = await c.req.json()
  const existing: any = await c.env.MONITOR_KV.get('config', 'json') || {}

  const merged: any = { ...existing }
  for (const [key, val] of Object.entries(body)) {
    if (val === '__REMOVE__') {
      delete merged[key]
    } else if (val !== '' && val !== undefined && val !== null) {
      merged[key] = val
    }
  }

  await c.env.MONITOR_KV.put('config', JSON.stringify(merged))
  return c.json({ ok: true, message: '설정이 저장되었습니다' })
})

// Firebase 토큰 등록
app.post('/api/token', async (c) => {
  const body = await c.req.json()
  const { id_token, refresh_token, uid } = body

  if (!refresh_token || !uid) {
    return c.json({ ok: false, error: 'refresh_token과 uid가 필요합니다' }, 400)
  }

  const config: any = await c.env.MONITOR_KV.get('config', 'json') || {}
  const updated = {
    ...config,
    firebase_id_token: id_token || '',
    firebase_refresh_token: refresh_token,
    firebase_uid: uid,
    token_updated_at: new Date().toISOString(),
  }
  await c.env.MONITOR_KV.put('config', JSON.stringify(updated))

  return c.json({ ok: true, message: `토큰 등록 완료 (UID: ${uid})` })
})

// ✅ 개선: BUN Auth Token + Talk ID Token 등록 (만료 예상 시점 + 경고 리셋)
app.post('/api/bun-token', async (c) => {
  const body = await c.req.json()
  const { bun_auth_token, talk_id_token } = body

  if (!bun_auth_token && !talk_id_token) {
    return c.json({ ok: false, error: 'bun_auth_token 또는 talk_id_token이 필요합니다' }, 400)
  }

  const config: any = await c.env.MONITOR_KV.get('config', 'json') || {}
  if (bun_auth_token) config.bun_auth_token = bun_auth_token
  if (talk_id_token) config.talk_id_token = talk_id_token
  config.bun_token_updated_at = new Date().toISOString()

  // ✅ 만료 예상 시점 기록 (5일 후)
  const expiry = new Date()
  expiry.setDate(expiry.getDate() + 5)
  config.bun_token_expires_at = expiry.toISOString()

  // ✅ 만료 경고 플래그 리셋
  config.bun_token_expiry_warned = false

  await c.env.MONITOR_KV.put('config', JSON.stringify(config))

  return c.json({
    ok: true,
    message: '번개장터 토큰 등록 완료 - 답장 기능 활성화!',
    expires_at: config.bun_token_expires_at,
  })
})

// Talk ID Token 갱신 (BUN Auth Token으로)
async function refreshTalkToken(config: any, kv: KVNamespace): Promise<string | null> {
  if (!config.bun_auth_token) return null

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
  return null
}

// ── 답장 API ──
app.post('/api/reply', async (c) => {
  const body = await c.req.json()
  const { channel_id, target_uid, message } = body

  if (!target_uid || !message) {
    return c.json({ ok: false, error: 'target_uid와 message가 필요합니다' }, 400)
  }

  const config: any = await c.env.MONITOR_KV.get('config', 'json') || {}

  if (!config.bun_auth_token) {
    return c.json({ ok: false, error: '번개장터 인증 토큰이 없습니다. 로컬 모니터(start.bat)를 다시 실행해주세요.' }, 403)
  }

  let talkToken = config.talk_id_token
  if (!talkToken) {
    talkToken = await refreshTalkToken(config, c.env.MONITOR_KV)
    if (!talkToken) {
      return c.json({ ok: false, error: 'Talk 인증 실패. 로컬 모니터를 다시 실행해주세요.' }, 403)
    }
  }

  const sendPayload: any = {
    targetUid: String(target_uid),
    messageType: 1,
    content: message,
    extra: '{}',
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-BUN-AUTH-TOKEN': config.bun_auth_token,
    'X-BUN-TALK-ID-TOKEN': talkToken,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://talk.bunjang.co.kr/',
    'Origin': 'https://talk.bunjang.co.kr',
  }

  let resp = await fetch('https://api.bunjang.co.kr/api/talk/v3/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify(sendPayload),
  })

  if (resp.status === 401) {
    talkToken = await refreshTalkToken(config, c.env.MONITOR_KV)
    if (!talkToken) {
      return c.json({ ok: false, error: 'Talk 인증 갱신 실패' }, 401)
    }
    headers['X-BUN-TALK-ID-TOKEN'] = talkToken

    resp = await fetch('https://api.bunjang.co.kr/api/talk/v3/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify(sendPayload),
    })
  }

  const result: any = await resp.json()

  if (resp.ok && (result.status === 'SUCCESS' || result.data)) {
    const logs: string[] = (await c.env.MONITOR_KV.get('logs', 'json')) || []
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
    logs.unshift(`[${timestamp}] [REPLY] ↩️ → ${target_uid}: ${message.slice(0, 100)}`)
    if (logs.length > 500) logs.length = 500
    await c.env.MONITOR_KV.put('logs', JSON.stringify(logs))

    return c.json({ ok: true, message: '답장 전송 완료!' })
  } else {
    return c.json({
      ok: false,
      error: `전송 실패 (${resp.status}): ${JSON.stringify(result).slice(0, 200)}`,
      detail: result,
    })
  }
})

// ── 채팅방 메시지 조회 API ──
app.get('/api/messages/:channelId', async (c) => {
  const channelId = c.req.param('channelId')
  const config: any = await c.env.MONITOR_KV.get('config', 'json') || {}

  if (!config.bun_auth_token) {
    return c.json({ ok: false, error: '번개장터 토큰 없음. start.bat을 실행하세요.' })
  }

  const myUid = config.firebase_uid || ''
  const parts = channelId.split('_')
  const targetUid = parts.find((p: string) => p !== myUid) || parts[0] || ''

  if (!targetUid) {
    return c.json({ ok: false, error: '상대방 UID를 추출할 수 없음' })
  }

  let talkToken = config.talk_id_token
  if (!talkToken) {
    talkToken = await refreshTalkToken(config, c.env.MONITOR_KV)
    if (!talkToken) {
      return c.json({ ok: false, error: 'Talk 인증 실패' })
    }
  }

  let resp = await fetch(`https://api.bunjang.co.kr/api/talk/v3/messages?targetUid=${targetUid}&size=100`, {
    headers: {
      'X-BUN-AUTH-TOKEN': config.bun_auth_token,
      'X-BUN-TALK-ID-TOKEN': talkToken,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://talk.bunjang.co.kr/',
    },
  })

  if (resp.status === 401) {
    talkToken = await refreshTalkToken(config, c.env.MONITOR_KV)
    if (!talkToken) {
      return c.json({ ok: false, error: 'Talk 인증 갱신 실패' })
    }
    resp = await fetch(`https://api.bunjang.co.kr/api/talk/v3/messages?targetUid=${targetUid}&size=100`, {
      headers: {
        'X-BUN-AUTH-TOKEN': config.bun_auth_token,
        'X-BUN-TALK-ID-TOKEN': talkToken,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://talk.bunjang.co.kr/',
      },
    })
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    return c.json({ ok: false, error: `Talk API 에러 (${resp.status}): ${errText.slice(0, 200)}` })
  }

  const data: any = await resp.json()
  const rawMessages = data?.data || data?.messages || []

  const messages = rawMessages.map((m: any) => ({
    id: m.id || '',
    content: m.content || m.text || '',
    created_at: m.createdAt || m.created_at || '',
    sender_id: String(m.uid || m.senderId || m.sender_id || ''),
    message_type: m.messageType || m.message_type || 1,
    extra: m.extra || null,
  })).filter((m: any) => m.content !== '')

  return c.json({
    ok: true,
    messages,
    my_uid: myUid,
    reply_enabled: !!config.bun_auth_token,
  })
})

// 최근 채팅 목록 (답장 UI용)
app.get('/api/recent-chats', async (c) => {
  const state: any = await c.env.MONITOR_KV.get('chat_state', 'json') || { known: {} }
  const nicknameCache: any = await c.env.MONITOR_KV.get('nickname_cache', 'json') || {}
  const config: any = await c.env.MONITOR_KV.get('config', 'json') || {}
  const ignoreKeywords: string[] = config.ignore_keywords || []

  const chats = Object.entries(state.known || {})
    .map(([channelId, data]: [string, any]) => {
      const parts = channelId.split('_')
      const myUid = config.firebase_uid || ''
      const otherId = parts.find((p: string) => p !== myUid) || parts[0] || ''
      const lastMsg = data.msg || ''

      const isFiltered = ignoreKeywords.length > 0 && ignoreKeywords.some((kw: string) => lastMsg.includes(kw))
      const isMyLastMsg = data.sender_id === myUid
      const needsReply = !isFiltered && !isMyLastMsg && lastMsg !== ''

      return {
        channel_id: channelId,
        other_id: otherId,
        nickname: nicknameCache[otherId] || otherId,
        last_message: lastMsg,
        last_time: data.ts || '',
        sender_id: data.sender_id || '',
        is_filtered: isFiltered,
        needs_reply: needsReply,
      }
    })
    .sort((a, b) => (b.last_time || '').localeCompare(a.last_time || ''))
    .slice(0, 50)

  return c.json({
    ok: true,
    chats,
    reply_enabled: !!config.bun_auth_token,
    my_uid: config.firebase_uid || '',
    ignore_keywords: ignoreKeywords,
  })
})

// 수동 폴링 트리거
app.get('/api/cron', async (c) => {
  const result = await monitor(c.env.MONITOR_KV)
  return c.json({ ok: true, result })
})

app.post('/api/trigger', async (c) => {
  const result = await monitor(c.env.MONITOR_KV)
  return c.json({ ok: true, result })
})

// 테스트 알림 전송
app.post('/api/test-notify', async (c) => {
  const body = await c.req.json()
  const channel = body.channel || 'all'
  const config: any = await c.env.MONITOR_KV.get('config', 'json') || {}

  const testMsg = `[번개장터 테스트]\n정상 작동 확인!\n시간: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`

  if (channel === 'telegram' || channel === 'all') {
    if (!config.telegram_bot_token || !config.telegram_chat_id) {
      return c.json({ ok: false, error: '텔레그램 설정이 없습니다' })
    }
    try {
      const resp = await fetch(`https://api.telegram.org/bot${config.telegram_bot_token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: config.telegram_chat_id, text: testMsg }),
      })
      const result: any = await resp.json()
      if (!result.ok) {
        return c.json({ ok: false, error: `텔레그램 에러: ${result.description}` })
      }
    } catch (e: any) {
      return c.json({ ok: false, error: `텔레그램 전송 실패: ${e.message}` })
    }
  }

  if (channel === 'slack' || channel === 'all') {
    if (!config.slack_webhook_url) {
      return c.json({ ok: false, error: '슬랙 Webhook URL이 설정되지 않았습니다' })
    }
    try {
      const resp = await fetch(config.slack_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: testMsg }),
      })
      if (!resp.ok) {
        const body = await resp.text()
        return c.json({ ok: false, error: `슬랙 에러: ${body}` })
      }
    } catch (e: any) {
      return c.json({ ok: false, error: `슬랙 전송 실패: ${e.message}` })
    }
  }

  return c.json({ ok: true, message: '테스트 전송 완료' })
})

// ✅ 개선: 로그 조회 (일별 로그 지원)
app.get('/api/logs', async (c) => {
  const date = c.req.query('date')

  if (date) {
    const dailyLogs = await c.env.MONITOR_KV.get(`logs:${date}`, 'json') || []
    return c.json({ ok: true, logs: dailyLogs, date, type: 'daily' })
  }

  const logs = await c.env.MONITOR_KV.get('logs', 'json') || []
  return c.json({ ok: true, logs, type: 'recent' })
})

// ✅ 신규: 보관된 로그 날짜 목록 조회
app.get('/api/logs/dates', async (c) => {
  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }

  const available: { date: string; count: number }[] = []
  for (const date of dates) {
    const logs: any[] = (await c.env.MONITOR_KV.get(`logs:${date}`, 'json')) || []
    if (logs.length > 0) {
      available.push({ date, count: logs.length })
    }
  }

  return c.json({ ok: true, dates: available })
})

// 상태 조회 (✅ BUN 토큰 만료 예상 시점 추가)
app.get('/api/status', async (c) => {
  const config: any = await c.env.MONITOR_KV.get('config', 'json') || {}
  const state: any = await c.env.MONITOR_KV.get('chat_state', 'json') || {}

  return c.json({
    ok: true,
    status: {
      uid: config.firebase_uid || 'Not Set',
      has_token: !!config.firebase_refresh_token,
      has_telegram: !!config.telegram_bot_token && !!config.telegram_chat_id,
      has_slack: !!config.slack_webhook_url,
      has_reply: !!config.bun_auth_token,
      last_poll: state.last_poll || 'Never',
      tracked_chats: Object.keys(state.known || {}).length,
      ignore_keywords: config.ignore_keywords || [],
      bun_token_updated: config.bun_token_updated_at || null,
      bun_token_expires: config.bun_token_expires_at || null,
      bun_token_healthy: !config.bun_token_expiry_warned,
    }
  })
})

// 닉네임 캐시
app.get('/api/nicknames', async (c) => {
  const cache = await c.env.MONITOR_KV.get('nickname_cache', 'json') || {}
  return c.json({ ok: true, nicknames: cache })
})

// 상태 초기화
app.post('/api/reset', async (c) => {
  await c.env.MONITOR_KV.delete('chat_state')
  await c.env.MONITOR_KV.delete('nickname_cache')
  return c.json({ ok: true, message: '채팅 상태 초기화됨' })
})

export default app
