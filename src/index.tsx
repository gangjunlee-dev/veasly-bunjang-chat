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

app.get('/favicon.ico', (c) => {
  return new Response(null, { status: 204 })
})
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

// 서버사이드 채팅 검색: 현재 채팅 + 아카이브까지 검색
app.get('/api/search-chats', async (c) => {
  const qRaw = c.req.query('q') || ''
  const q = qRaw.trim().toLowerCase()

  const requestedLimit = Number(c.req.query('limit') || '300')
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 300, 1), 500)

  const state: any = await c.env.MONITOR_KV.get('chat_state', 'json') || { known: {} }
  const archive: any = await c.env.MONITOR_KV.get('chat_state_archive', 'json') || {}
  const nicknameCache: any = await c.env.MONITOR_KV.get('nickname_cache', 'json') || {}
  const config: any = await c.env.MONITOR_KV.get('config', 'json') || {}

  const ignoreKeywords: string[] = config.ignore_keywords || []
  const myUid = config.firebase_uid || ''

  const toChat = (channelId: string, data: any, archived: boolean) => {
    const parts = channelId.split('_')
    const otherId = String(data?.other_id || parts.find((p: string) => p !== myUid) || parts[0] || '')
    const lastMsg = String(data?.msg || '')

    const isFiltered = ignoreKeywords.length > 0 && ignoreKeywords.some((kw: string) => lastMsg.includes(kw))
    const isMyLastMsg = String(data?.sender_id || '') === String(myUid)
    const needsReply = !isFiltered && !isMyLastMsg && lastMsg !== ''

    return {
      channel_id: channelId,
      other_id: otherId,
      nickname: nicknameCache[otherId] || otherId,
      last_message: lastMsg,
      last_time: data?.ts || '',
      sender_id: data?.sender_id || '',
      is_filtered: isFiltered,
      needs_reply: needsReply,
      archived,
    }
  }

  // archive 먼저 넣고, 현재 state가 있으면 현재 데이터로 덮어쓴다.
  const merged = new Map<string, any>()

  for (const [channelId, data] of Object.entries(archive || {})) {
    merged.set(channelId, toChat(channelId, data, true))
  }

  for (const [channelId, data] of Object.entries(state.known || {})) {
    merged.set(channelId, toChat(channelId, data, false))
  }

  let chats = Array.from(merged.values())

  if (q) {
    chats = chats.filter((chat: any) => {
      const haystack = [
        chat.channel_id,
        chat.other_id,
        chat.nickname,
        chat.last_message,
      ].join(' ').toLowerCase()

      return haystack.includes(q)
    })
  }

  chats = chats
    .sort((a: any, b: any) => (b.last_time || '').localeCompare(a.last_time || ''))
    .slice(0, limit)

  return c.json({
    ok: true,
    query: qRaw,
    count: chats.length,
    chats,
    reply_enabled: !!config.bun_auth_token,
    my_uid: myUid,
    ignore_keywords: ignoreKeywords,
  })
})
// 최근 채팅 목록 (답장 UI용)

// 상품 URL / 상품번호로 채팅방 찾기
app.get('/api/find-chat-by-product', async (c) => {
  try {
    const urlParam = c.req.query('url') || ''
    const productIdParam = c.req.query('product_id') || c.req.query('pid') || ''
    const limitRaw = parseInt(c.req.query('limit') || '300', 10)
    const limit = Math.min(Math.max(isNaN(limitRaw) ? 300 : limitRaw, 1), 500)

    const extractProductId = (input: string): string => {
      if (!input) return ''
      const decoded = decodeURIComponent(input)
      const fromUrl = decoded.match(/\/products\/(\d+)/)
      if (fromUrl && fromUrl[1]) return fromUrl[1]
      const numeric = decoded.match(/\b(\d{6,15})\b/)
      if (numeric && numeric[1]) return numeric[1]
      return ''
    }

    const productId = extractProductId(productIdParam || urlParam)

    if (!productId) {
      return c.json({
        ok: false,
        error: '상품번호를 찾을 수 없습니다. product_id 또는 번개장터 상품 URL을 입력하세요.',
        input: { url: urlParam, product_id: productIdParam }
      }, 400)
    }

    const config = await c.env.MONITOR_KV.get('config', 'json') as any || {}
    const myUid = String(config.uid || config.my_uid || config.user_id || '')

    const currentState = await c.env.MONITOR_KV.get('chat_state', 'json') as any || {}
    const archiveState = await c.env.MONITOR_KV.get('chat_state_archive', 'json') as any || {}

    const normalizeList = (state: any, archived: boolean): any[] => {
      if (!state) return []

      let raw: any[] = []

      if (Array.isArray(state)) {
        raw = state
      } else if (Array.isArray(state.chats)) {
        raw = state.chats
      } else if (Array.isArray(state.channels)) {
        raw = state.channels
      } else if (Array.isArray(state.recent_chats)) {
        raw = state.recent_chats
      } else if (typeof state === 'object') {
        const values = Object.values(state)
        const objectValues = values.filter((v: any) => v && typeof v === 'object')
        raw = objectValues as any[]
      }

      return raw
        .filter((x: any) => x && typeof x === 'object')
        .map((x: any) => ({
          ...x,
          archived,
          channel_id: String(x.channel_id || x.channelId || x.id || ''),
          other_id: String(x.other_id || x.otherId || x.target_uid || x.targetUid || x.uid || ''),
          nickname: String(x.nickname || x.nick || x.shop_name || x.shopName || ''),
          last_message: String(x.last_message || x.lastMessage || x.message || x.text || ''),
          last_time: x.last_time || x.lastTime || x.updated_at || x.updatedAt || x.created_at || x.createdAt || ''
        }))
    }

    const currentChats = normalizeList(currentState, false)
    const archivedChats = normalizeList(archiveState, true)

    const byKey = new Map<string, any>()
    for (const chat of [...archivedChats, ...currentChats]) {
      const key = chat.channel_id || `${chat.other_id}:${chat.last_time}:${chat.last_message}`
      const prev = byKey.get(key)
      if (!prev || prev.archived) {
        byKey.set(key, chat)
      }
    }

    const allChats = Array.from(byKey.values())

    const buildSearchText = (chat: any): string => {
      const parts: string[] = []

      const add = (v: any) => {
        if (v === undefined || v === null) return
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          parts.push(String(v))
        } else if (Array.isArray(v)) {
          for (const item of v.slice(-50)) add(item)
        } else if (typeof v === 'object') {
          for (const key of Object.keys(v)) {
            if (
              key.toLowerCase().includes('message') ||
              key.toLowerCase().includes('product') ||
              key.toLowerCase().includes('title') ||
              key.toLowerCase().includes('pid') ||
              key.toLowerCase().includes('url') ||
              key.toLowerCase().includes('uid') ||
              key.toLowerCase().includes('id')
            ) {
              add(v[key])
            }
          }
        }
      }

      add(chat)
      return parts.join(' ').toLowerCase()
    }

    // 1차: 기존 KV/아카이브에서 상품번호 직접 검색
    const directMatches = allChats.filter((chat: any) => {
      const text = buildSearchText(chat)
      return text.includes(productId.toLowerCase())
    })

    // 2차: 번개장터 상품 API들에서 판매자 UID 후보 추출 시도
    const attemptedUrls: string[] = []
    const sellerCandidates = new Set<string>()
    let productApiFound = false
    let productApiError = ''

    const candidateProductUrls = [
      `https://api.bunjang.co.kr/api/1/product/${productId}/detail_info.json`,
      `https://api.bunjang.co.kr/api/1/product/${productId}/detail_info.json?version=2`,
      `https://m.bunjang.co.kr/api/rec/v3/products/product-detail?pid=${productId}`
    ]

    const collectSellerIds = (obj: any) => {
      const visit = (node: any, path: string) => {
        if (!node || typeof node !== 'object') return

        for (const [k, v] of Object.entries(node)) {
          const key = String(k).toLowerCase()
          const nextPath = path ? `${path}.${k}` : String(k)

          if (
            (
              key.includes('seller') ||
              key.includes('shop') ||
              key.includes('user') ||
              key === 'uid' ||
              key.endsWith('_uid') ||
              key.endsWith('uid')
            ) &&
            (typeof v === 'string' || typeof v === 'number')
          ) {
            const s = String(v)
            if (/^\d{4,15}$/.test(s) && s !== productId) {
              sellerCandidates.add(s)
            }
          }

          if (typeof v === 'object') visit(v, nextPath)
        }
      }

      visit(obj, '')
    }

    for (const apiUrl of candidateProductUrls) {
      attemptedUrls.push(apiUrl)

      try {
        const res = await fetch(apiUrl, {
          headers: {
            'accept': 'application/json, text/plain, */*',
            'user-agent': 'Mozilla/5.0 VeaslyBunjangMonitor/1.0'
          }
        })

        if (!res.ok) {
          continue
        }

        const contentType = res.headers.get('content-type') || ''
        let data: any = null

        if (contentType.includes('application/json')) {
          data = await res.json()
        } else {
          const text = await res.text()
          try {
            data = JSON.parse(text)
          } catch {
            data = { text }
          }
        }

        productApiFound = true
        collectSellerIds(data)
      } catch (err: any) {
        productApiError = err?.message || String(err)
      }
    }

    // 3차: 판매자 UID 후보가 있으면 channel_id / other_id 기준으로 검색
    const sellerIds = Array.from(sellerCandidates)

    const sellerMatches = sellerIds.length > 0
      ? allChats.filter((chat: any) => {
          const channelId = String(chat.channel_id || '')
          const otherId = String(chat.other_id || '')
          return sellerIds.some((sellerId) =>
            otherId === sellerId ||
            channelId.includes(sellerId) ||
            buildSearchText(chat).includes(sellerId)
          )
        })
      : []

    const merged = new Map<string, any>()

    for (const chat of [...directMatches, ...sellerMatches]) {
      const key = chat.channel_id || `${chat.other_id}:${chat.last_time}:${chat.last_message}`
      merged.set(key, {
        ...chat,
        match_reason: directMatches.includes(chat)
          ? 'product_id_in_chat_data'
          : 'seller_uid_match'
      })
    }

    const results = Array.from(merged.values())
      .sort((a: any, b: any) => {
        const at = new Date(a.last_time || 0).getTime()
        const bt = new Date(b.last_time || 0).getTime()
        return bt - at
      })
      .slice(0, limit)

    const reason =
      results.length > 0
        ? 'matched'
        : sellerIds.length > 0
          ? 'seller_uid_found_but_no_chat_match'
          : productApiFound
            ? 'product_api_found_but_seller_uid_not_found'
            : 'product_api_not_found_or_unavailable'

    return c.json({
      ok: true,
      product_id: productId,
      count: results.length,
      chats: results,
      my_uid: myUid,
      seller_candidates: sellerIds,
      product_api_found: productApiFound,
      attempted_urls: attemptedUrls,
      product_api_error: productApiError || null,
      reason,
      note: results.length === 0
        ? '상품이 삭제/비공개/오래된 거래이면 번장 API에서 판매자 UID를 못 주거나, 기존 KV/아카이브에 상품번호가 없어 매칭이 안 될 수 있습니다.'
        : ''
    })
  } catch (error: any) {
    return c.json({
      ok: false,
      error: error?.message || String(error)
    }, 500)
  }
})




// 딥 검색 v5.2: recent-chats 기반 안정 검색 + offset + 메시지 본문 검색
app.get('/api/deep-search-chats', async (c) => {
  try {
    const rawQuery =
      c.req.query('q') ||
      c.req.query('query') ||
      c.req.query('product_id') ||
      c.req.query('pid') ||
      c.req.query('url') ||
      ''

    const decodedQuery = (() => {
      try {
        return decodeURIComponent(rawQuery)
      } catch {
        return rawQuery
      }
    })().trim()

    const scanLimitRaw = parseInt(c.req.query('limit') || '100', 10)
    const messageLimitRaw = parseInt(c.req.query('message_limit') || '100', 10)
    const fetchLimitRaw = parseInt(c.req.query('fetch_limit') || '40', 10)
    const offsetRaw = parseInt(c.req.query('offset') || '0', 10)
    const resultLimitRaw = parseInt(c.req.query('result_limit') || '100', 10)

    const scanLimit = Math.min(Math.max(isNaN(scanLimitRaw) ? 100 : scanLimitRaw, 1), 300)
    const messageLimit = Math.min(Math.max(isNaN(messageLimitRaw) ? 100 : messageLimitRaw, 1), 100)
    const fetchLimit = Math.min(Math.max(isNaN(fetchLimitRaw) ? 40 : fetchLimitRaw, 0), 40)
    const offset = Math.min(Math.max(isNaN(offsetRaw) ? 0 : offsetRaw, 0), 1000)
    const resultLimit = Math.min(Math.max(isNaN(resultLimitRaw) ? 100 : resultLimitRaw, 1), 300)

    const extractProductId = (input: string): string => {
      if (!input) return ''
      const fromUrl = input.match(/\/products\/(\d+)/)
      if (fromUrl && fromUrl[1]) return fromUrl[1]
      const numeric = input.match(/\b(\d{6,15})\b/)
      if (numeric && numeric[1]) return numeric[1]
      return ''
    }

    const productId = extractProductId(decodedQuery)

    if (!decodedQuery && !productId) {
      return c.json({
        ok: false,
        error: '검색어가 없습니다. q, product_id 또는 url을 입력하세요.',
        reason: 'empty_query'
      })
    }

    const queryTerms = Array.from(new Set([
      decodedQuery,
      productId
    ].filter(Boolean).map((x) => String(x).toLowerCase())))

    const origin = new URL(c.req.url).origin

    const normalizeText = (value: any): string => {
      return String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
    }

    const stringifyDeep = (value: any, depth = 0): string => {
      if (value === undefined || value === null) return ''
      if (depth > 6) return ''

      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        return String(value)
      }

      if (Array.isArray(value)) {
        return value.slice(-100).map((x) => stringifyDeep(x, depth + 1)).join(' ')
      }

      if (typeof value === 'object') {
        const parts: string[] = []

        for (const [key, val] of Object.entries(value)) {
          const k = String(key).toLowerCase()

          if (
            depth <= 2 ||
            k.includes('message') ||
            k.includes('text') ||
            k.includes('body') ||
            k.includes('content') ||
            k.includes('msg') ||
            k.includes('product') ||
            k.includes('title') ||
            k.includes('name') ||
            k.includes('pid') ||
            k.includes('url') ||
            k.includes('uid') ||
            k.includes('id') ||
            k.includes('nickname')
          ) {
            parts.push(String(key))
            parts.push(stringifyDeep(val, depth + 1))
          }
        }

        return parts.join(' ')
      }

      return ''
    }

    const isMatch = (text: string): boolean => {
      const lower = normalizeText(text)
      return queryTerms.some((term) => term && lower.includes(term))
    }

    const makeSnippet = (text: string): string => {
      const normalized = String(text || '').replace(/\s+/g, ' ').trim()
      if (!normalized) return ''

      const lower = normalized.toLowerCase()
      let idx = -1

      for (const term of queryTerms) {
        idx = lower.indexOf(term)
        if (idx >= 0) break
      }

      if (idx < 0) return normalized.slice(0, 180)

      const start = Math.max(0, idx - 70)
      const end = Math.min(normalized.length, idx + 140)

      return normalized.slice(start, end)
    }

    const safeChat = (chat: any): any => {
      return {
        channel_id: String(chat.channel_id || chat.channelId || ''),
        other_id: String(chat.other_id || chat.otherId || chat.target_uid || chat.targetUid || ''),
        nickname: String(chat.nickname || chat.nick || chat.shop_name || chat.shopName || ''),
        last_message: String(chat.last_message || chat.lastMessage || chat.message || ''),
        last_time: chat.last_time || chat.lastTime || chat.updated_at || chat.updatedAt || '',
        archived: Boolean(chat.archived || chat.is_archived || false),
        is_filtered: Boolean(chat.is_filtered || false),
        needs_reply: Boolean(chat.needs_reply || false)
      }
    }

    // 1단계: 검증된 recent-chats API에서 정규화된 채팅 목록 확보
    const recentUrl = origin + '/api/recent-chats?limit=' + scanLimit
    const recentRes = await fetch(recentUrl, {
      headers: {
        accept: 'application/json'
      }
    })

    if (!recentRes.ok) {
      return c.json({
        ok: false,
        error: 'recent-chats 조회 실패',
        status: recentRes.status,
        reason: 'recent_chats_fetch_failed'
      })
    }

    const recentData = await recentRes.json() as any
    const recentChatsRaw = Array.isArray(recentData.chats) ? recentData.chats : []
    const allChats = recentChatsRaw.map(safeChat).filter((chat: any) => chat.channel_id)

    const resultsMap = new Map<string, any>()
    const errors: any[] = []

    let summaryMatches = 0
    let fetchedChannels = 0
    let messageMatches = 0

    // 2단계: 요약 필드 검색
    for (const chat of allChats) {
      const summaryText = [
        chat.channel_id,
        chat.other_id,
        chat.nickname,
        chat.last_message,
        chat.last_time
      ].join(' ')

      if (isMatch(summaryText)) {
        summaryMatches += 1

        resultsMap.set(chat.channel_id, {
          ...chat,
          match_reason: 'summary_match',
          summary_snippet: makeSnippet(summaryText),
          matched_messages: [],
          matched_message_count: 0,
          message_fetch_status: 'not_needed'
        })
      }
    }

    // 3단계: offset 적용 후 메시지 본문 검색
    const fetchTargets = allChats
      .filter((chat: any) => chat.channel_id)
      .slice(offset, offset + fetchLimit)

    const fetchMessagesForChat = async (chat: any) => {
      const channelId = String(chat.channel_id || '')
      if (!channelId) return

      let timer: any = null

      try {
        const controller = new AbortController()

        timer = setTimeout(() => {
          try {
            controller.abort()
          } catch {}
        }, 3000)

        const messageUrl =
          origin +
          '/api/messages/' +
          encodeURIComponent(channelId) +
          '?limit=' +
          messageLimit

        const res = await fetch(messageUrl, {
          headers: {
            accept: 'application/json'
          },
          signal: controller.signal
        })

        if (!res.ok) {
          errors.push({
            channel_id: channelId,
            status: res.status,
            error: 'message_fetch_not_ok'
          })
          return
        }

        fetchedChannels += 1

        const data = await res.json() as any

        const messages = Array.isArray(data.messages)
          ? data.messages
          : Array.isArray(data.data)
            ? data.data
            : Array.isArray(data.result)
              ? data.result
              : Array.isArray(data)
                ? data
                : []

        const matchedMessages: any[] = []

        for (const msg of messages.slice(-messageLimit)) {
          const msgText = stringifyDeep(msg)

          if (isMatch(msgText)) {
            matchedMessages.push({
              snippet: makeSnippet(msgText),
              raw_text: String(
                msg.message ||
                msg.text ||
                msg.body ||
                msg.content ||
                msg.message_text ||
                msg.msg ||
                ''
              ).slice(0, 500),
              created_at: msg.created_at || msg.createdAt || msg.timestamp || msg.time || '',
              sender_id: msg.sender_id || msg.senderId || msg.uid || ''
            })

            if (matchedMessages.length >= 5) break
          }
        }

        if (matchedMessages.length > 0) {
          messageMatches += 1

          const prev = resultsMap.get(channelId)

          resultsMap.set(channelId, {
            ...chat,
            match_reason: prev ? prev.match_reason + '+message_match' : 'message_match',
            summary_snippet: prev ? prev.summary_snippet : makeSnippet([
              chat.channel_id,
              chat.other_id,
              chat.nickname,
              chat.last_message
            ].join(' ')),
            matched_messages: matchedMessages,
            matched_message_count: matchedMessages.length,
            message_fetch_status: String(res.status)
          })
        }
      } catch (err: any) {
        errors.push({
          channel_id: channelId,
          error: err?.message || String(err)
        })
      } finally {
        if (timer) clearTimeout(timer)
      }
    }

    for (let i = 0; i < fetchTargets.length; i += 5) {
      const batch = fetchTargets.slice(i, i + 5)
      await Promise.all(batch.map((chat: any) => fetchMessagesForChat(chat)))
    }

    const results = Array.from(resultsMap.values())
      .sort((a: any, b: any) => {
        const at = new Date(a.last_time || 0).getTime()
        const bt = new Date(b.last_time || 0).getTime()
        return bt - at
      })
      .slice(0, resultLimit)

    const reason =
      results.length > 0
        ? 'matched'
        : productId
          ? 'no_match_after_deep_search_for_product_id'
          : 'no_match_after_deep_search'

    return c.json({
      ok: true,
      query: decodedQuery,
      product_id: productId || null,
      query_terms: queryTerms,
      count: results.length,
      chats: results,
      scanned_channels: allChats.length,
      offset: offset,
      fetch_targets: fetchTargets.length,
      fetched_channels: fetchedChannels,
      summary_matches: summaryMatches,
      message_matches: messageMatches,
      reason,
      errors: errors.slice(0, 10),
      source: 'recent-chats',
      note: results.length === 0
        ? 'recent-chats 목록과 조회 가능한 최근 메시지에서 검색어를 찾지 못했습니다.'
        : ''
    })
  } catch (error: any) {
    return c.json({
      ok: false,
      error: error?.message || String(error),
      reason: 'deep_search_internal_error_v52'
    })
  }
})

app.get('/api/recent-chats', async (c) => {
  const state: any = await c.env.MONITOR_KV.get('chat_state', 'json') || { known: {} }
  const nicknameCache: any = await c.env.MONITOR_KV.get('nickname_cache', 'json') || {}
  const config: any = await c.env.MONITOR_KV.get('config', 'json') || {}
  const ignoreKeywords: string[] = config.ignore_keywords || []
  const requestedLimit = Number(c.req.query('limit') || '300')
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 300, 1), 500)

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
    .slice(0, limit)

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
  // 운영 데이터 보호: 실수로 기존 채팅 상태가 삭제되는 것을 방지한다.
  // 필요 시 Cloudflare KV 백업 후 관리자 전용 임시 스크립트로만 초기화한다.
  return c.json({
    ok: false,
    error: 'Reset is disabled in production to protect existing chat data.',
  }, 403)
})

export default app






