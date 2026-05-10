/**
 * 웹 대시보드 - 메신저 형태 UI v6.0
 * 좌측: 채팅방 목록 (검색 + 필터 토글) / 우측: 대화방 (말풍선 + 입력창)
 */

export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>번개장터 채팅 모니터 - Cloud v6.0</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

    /* ── Layout ── */
    .app { display: flex; height: 100vh; }
    .sidebar { width: 400px; min-width: 400px; background: #fff; border-right: 1px solid #e2e8f0; display: flex; flex-direction: column; }
    .chatroom { flex: 1; display: flex; flex-direction: column; background: #e8e4de; }

    /* ── Sidebar header ── */
    .sb-header { padding: 14px 18px 10px; border-bottom: 1px solid #e2e8f0; background: #fff; }
    .sb-header h1 { font-size: 17px; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 8px; margin: 0 0 8px 0; }
    .sb-status { display: flex; gap: 5px; flex-wrap: wrap; }
    .sb-badge { font-size: 10px; padding: 2px 7px; border-radius: 99px; font-weight: 600; }
    .sb-badge-on { background: #dcfce7; color: #16a34a; }
    .sb-badge-off { background: #fef2f2; color: #dc2626; }
    .sb-badge-info { background: #dbeafe; color: #2563eb; }
    .sb-actions { display: flex; gap: 5px; margin-top: 8px; }
    .sb-btn { font-size: 11px; padding: 4px 9px; border-radius: 6px; border: 1px solid #d1d5db; background: #fff; cursor: pointer; font-weight: 600; color: #475569; transition: all .15s; }
    .sb-btn:hover { background: #f8fafc; border-color: #94a3b8; }
    .sb-btn i { margin-right: 3px; }

    /* ── Search & Filter bar ── */
    .search-bar { padding: 10px 18px; background: #fff; border-bottom: 1px solid #e2e8f0; }
    .search-input-wrap { position: relative; margin-bottom: 8px; }
    .search-input-wrap i { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 13px; }
    .search-input { width: 100%; padding: 8px 12px 8px 34px; border: 1px solid #e2e8f0; border-radius: 20px; font-size: 13px; outline: none; background: #f8fafc; transition: border-color .15s; }
    .search-input:focus { border-color: #f97316; background: #fff; box-shadow: 0 0 0 3px rgba(249,115,22,.08); }
    .filter-row { display: flex; gap: 6px; align-items: center; }
    .filter-chip { font-size: 11px; padding: 4px 10px; border-radius: 99px; border: 1.5px solid #e2e8f0; background: #fff; cursor: pointer; font-weight: 600; color: #64748b; transition: all .15s; user-select: none; }
    .filter-chip:hover { border-color: #94a3b8; }
    .filter-chip.active { border-color: #f97316; background: #fff7ed; color: #ea580c; }
    .filter-chip.active-green { border-color: #22c55e; background: #f0fdf4; color: #16a34a; }
    .filter-count { font-size: 10px; color: #94a3b8; margin-left: auto; font-weight: 600; }

    /* ── Tab bar ── */
    .tab-bar { display: flex; border-bottom: 1px solid #e2e8f0; background: #fff; }
    .tab-item { flex: 1; text-align: center; padding: 10px; font-size: 13px; font-weight: 600; color: #94a3b8; cursor: pointer; border-bottom: 2px solid transparent; transition: all .15s; }
    .tab-item.active { color: #f97316; border-bottom-color: #f97316; }
    .tab-item:hover { color: #64748b; }

    /* ── Chat list ── */
    .chat-list { flex: 1; overflow-y: auto; }
    .chat-item { display: flex; align-items: center; gap: 12px; padding: 12px 18px; cursor: pointer; transition: all .15s; border-bottom: 1px solid #f8fafc; position: relative; }
    .chat-item:hover { background: #f8fafc; }
    .chat-item.active { background: #fff7ed; }
    .chat-item.needs-reply { border-left: 3px solid #22c55e; }
    .chat-item.filtered { opacity: 0.45; }
    .chat-item.filtered .chat-last { font-style: italic; }
    .chat-avatar { width: 42px; height: 42px; border-radius: 50%; background: linear-gradient(135deg, #f97316, #fb923c); display: flex; align-items: center; justify-content: center; font-weight: 700; color: #fff; font-size: 15px; flex-shrink: 0; }
    .chat-avatar.filtered-av { background: linear-gradient(135deg, #94a3b8, #cbd5e1); }
    .chat-meta { flex: 1; min-width: 0; }
    .chat-name { font-weight: 700; font-size: 13px; color: #1e293b; }
    .chat-uid { font-size: 10px; color: #94a3b8; margin-left: 5px; }
    .chat-last { font-size: 12px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; }
    .chat-last .my-prefix { color: #f97316; font-size: 11px; font-weight: 600; }
    .chat-time-col { text-align: right; flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
    .chat-time { font-size: 10px; color: #94a3b8; }
    .reply-badge { font-size: 9px; padding: 1px 6px; border-radius: 99px; background: #22c55e; color: #fff; font-weight: 700; }
    .filtered-badge { font-size: 9px; padding: 1px 6px; border-radius: 99px; background: #e2e8f0; color: #94a3b8; font-weight: 600; }
    .no-results { padding: 40px; text-align: center; color: #94a3b8; }
    .no-results i { font-size: 32px; display: block; margin-bottom: 10px; color: #cbd5e1; }

    /* ── Chatroom ── */
    .cr-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 16px; flex-direction: column; gap: 12px; }
    .cr-empty i { font-size: 48px; color: #cbd5e1; }
    .cr-header { padding: 14px 24px; background: #fff; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 12px; }
    .cr-header .back-btn { display: none; width: 36px; height: 36px; border-radius: 50%; background: #f1f5f9; border: none; cursor: pointer; font-size: 16px; color: #475569; }
    .cr-header-info { flex: 1; }
    .cr-header-name { font-weight: 700; font-size: 16px; color: #1e293b; }
    .cr-header-sub { font-size: 12px; color: #94a3b8; }
    .cr-header-actions button { padding: 6px 12px; font-size: 12px; border-radius: 6px; border: 1px solid #d1d5db; background: #fff; cursor: pointer; color: #475569; font-weight: 600; }
    .cr-header-actions button:hover { background: #f8fafc; }

    /* ── Messages ── */
    .cr-messages { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 4px; }
    .msg-date-sep { text-align: center; padding: 12px 0; font-size: 12px; color: #94a3b8; }
    .msg-date-sep span { background: #d1d5db33; padding: 4px 14px; border-radius: 99px; }
    .msg-row { display: flex; align-items: flex-end; gap: 6px; max-width: 75%; }
    .msg-row.mine { align-self: flex-end; flex-direction: row-reverse; }
    .msg-row.theirs { align-self: flex-start; }
    .msg-bubble { padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.5; word-break: break-word; max-width: 100%; }
    .msg-row.mine .msg-bubble { background: #f97316; color: #fff; border-bottom-right-radius: 4px; }
    .msg-row.theirs .msg-bubble { background: #fff; color: #1e293b; border-bottom-left-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
    .msg-time { font-size: 10px; color: #94a3b8; white-space: nowrap; flex-shrink: 0; padding-bottom: 2px; }
    .msg-loading { text-align: center; padding: 40px; color: #94a3b8; }
    .msg-system { text-align: center; padding: 6px; font-size: 12px; color: #94a3b8; font-style: italic; }

    /* ── Input bar ── */
    .cr-input { padding: 12px 20px; background: #fff; border-top: 1px solid #e2e8f0; display: flex; gap: 10px; align-items: flex-end; }
    .cr-input textarea { flex: 1; border: 1px solid #d1d5db; border-radius: 20px; padding: 10px 16px; font-size: 14px; resize: none; max-height: 120px; line-height: 1.4; font-family: inherit; outline: none; }
    .cr-input textarea:focus { border-color: #f97316; box-shadow: 0 0 0 3px rgba(249,115,22,.1); }
    .send-btn { width: 44px; height: 44px; border-radius: 50%; background: #f97316; color: #fff; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; transition: background .15s; flex-shrink: 0; }
    .send-btn:hover { background: #ea580c; }
    .send-btn:disabled { background: #d1d5db; cursor: not-allowed; }
    .cr-input-disabled { padding: 14px 20px; background: #fffbeb; border-top: 1px solid #e2e8f0; text-align: center; font-size: 13px; color: #b45309; }

    /* ── Settings panel ── */
    .settings-panel { flex: 1; overflow-y: auto; padding: 20px; }
    .settings-panel .card { background: #fff; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
    .settings-panel .card h3 { font-size: 15px; font-weight: 700; margin: 0 0 12px 0; display: flex; align-items: center; gap: 8px; }
    .settings-panel input, .settings-panel textarea { width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 9px 12px; font-size: 13px; outline: none; }
    .settings-panel input:focus, .settings-panel textarea:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,.1); }
    .settings-panel label { font-size: 12px; font-weight: 600; color: #64748b; display: block; margin-bottom: 4px; }
    .s-btn { padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 13px; border: none; transition: all .15s; }
    .s-btn-blue { background: #3b82f6; color: #fff; } .s-btn-blue:hover { background: #2563eb; }
    .s-btn-green { background: #22c55e; color: #fff; } .s-btn-green:hover { background: #16a34a; }
    .s-btn-red { background: #ef4444; color: #fff; } .s-btn-red:hover { background: #dc2626; }
    .s-btn-purple { background: #4A154B; color: #fff; } .s-btn-purple:hover { background: #611f69; }
    .s-result { margin-top: 8px; font-size: 12px; }

    /* ── Logs panel ── */
    .logs-panel { flex: 1; overflow-y: auto; padding: 16px; background: #f8fafc; }
    .log-line { font-family: 'Courier New', monospace; font-size: 12px; padding: 3px 8px; border-bottom: 1px solid #f1f5f9; line-height: 1.6; }
    .log-line.err { color: #dc2626; } .log-line.new { color: #2563eb; font-weight: 600; }
    .log-line.reply { color: #ea580c; font-weight: 600; } .log-line.init { color: #16a34a; }

    /* ── Mobile responsive ── */
    @media (max-width: 768px) {
      .sidebar { width: 100%; min-width: 100%; }
      .chatroom { display: none; position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 50; }
      .chatroom.open { display: flex; }
      .cr-header .back-btn { display: flex; align-items: center; justify-content: center; }
      .msg-row { max-width: 85%; }
    }
  </style>
</head>
<body>
<div class="app" id="app">
  <!-- SIDEBAR -->
  <div class="sidebar" id="sidebar">
    <div class="sb-header">
      <h1><i class="fas fa-bolt text-yellow-500"></i> 번개톡 모니터 <span class="text-xs font-normal bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full ml-1">v6.0</span></h1>
      <div class="sb-status" id="sb-status"></div>
      <div class="sb-actions">
        <button class="sb-btn" onclick="triggerPoll(this)"><i class="fas fa-sync-alt"></i>폴링</button>
        <button class="sb-btn" onclick="loadAll()"><i class="fas fa-redo"></i>새로고침</button>
        <button class="sb-btn" disabled title="데이터 보호를 위해 초기화가 비활성화되었습니다" style="opacity:.45;cursor:not-allowed"><i class="fas fa-lock"></i>초기화 잠금</button>
      </div>
    </div>

    <div class="tab-bar">
      <div class="tab-item active" data-tab="chats" onclick="switchTab('chats')"><i class="fas fa-comments mr-1"></i>채팅</div>
      <div class="tab-item" data-tab="guide" onclick="switchTab('guide')"><i class="fas fa-book mr-1"></i>가이드</div>
      <div class="tab-item" data-tab="settings" onclick="switchTab('settings')"><i class="fas fa-cog mr-1"></i>설정</div>
      <div class="tab-item" data-tab="logs" onclick="switchTab('logs')"><i class="fas fa-list-alt mr-1"></i>로그</div>
    </div>

    <!-- Tab: Chats -->
    <div id="tab-chats" style="display:flex;flex-direction:column;flex:1;overflow:hidden;">
      <!-- Search & Filter -->
      <div class="search-bar" id="search-bar">
        <div class="search-input-wrap">
          <i class="fas fa-search"></i>
          <input type="text" class="search-input" id="search-input" placeholder="판매자 이름 또는 채팅 내용 검색..." oninput="onSearch()">
        </div>
        <div class="filter-row">
          <div class="filter-chip active-green" id="chip-reply" onclick="toggleFilter('reply')"><i class="fas fa-reply mr-1"></i>답장 필요만</div>
          <div class="filter-chip" id="chip-all" onclick="toggleFilter('all')"><i class="fas fa-list mr-1"></i>전체 보기</div>
          <div class="filter-count" id="filter-count"></div>
        </div>
      </div>
      <!-- Chat list -->
      <div class="chat-list" id="chat-list-area">
        <div style="padding:40px;text-align:center;color:#94a3b8"><i class="fas fa-spinner fa-spin mr-2"></i>로딩 중...</div>
      </div>
    </div>

    <!-- Tab: Settings -->
    <div class="settings-panel" id="tab-settings" style="display:none">
      <!-- Token -->
      <div class="card">
        <h3><i class="fas fa-key text-orange-500"></i> 토큰 등록</h3>
        <p style="font-size:12px;color:#94a3b8;margin:0 0 10px">start.bat 실행 시 자동 등록. 수동: firebase_token.json 내용 붙여넣기</p>
        <textarea id="token-json" rows="3" placeholder='{"uid":"...","refresh_token":"...","bun_auth_token":"..."}'></textarea>
        <div style="margin-top:8px"><button class="s-btn s-btn-blue" onclick="saveToken()"><i class="fas fa-save mr-1"></i>등록</button></div>
        <div id="token-result" class="s-result"></div>
      </div>
      <!-- Telegram -->
      <div class="card">
        <h3><i class="fab fa-telegram text-blue-500"></i> 텔레그램 <span id="badge-tg" class="sb-badge sb-badge-off" style="margin-left:auto;font-size:10px">OFF</span></h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <div><label>Bot Token</label><input id="tg-token" placeholder="7012345:AAH..."></div>
          <div><label>Chat ID</label><input id="tg-chat" placeholder="123456789"></div>
        </div>
        <div style="display:flex;gap:6px"><button class="s-btn s-btn-blue" onclick="saveTelegram()">저장</button><button class="s-btn s-btn-green" onclick="testTelegram()">테스트</button></div>
        <div id="tg-result" class="s-result"></div>
      </div>
      <!-- Slack -->
      <div class="card">
        <h3><i class="fab fa-slack text-purple-600"></i> 슬랙 <span id="badge-slack" class="sb-badge sb-badge-off" style="margin-left:auto;font-size:10px">OFF</span></h3>
        <div style="margin-bottom:8px"><label>Webhook URL</label><input id="slack-webhook" placeholder="https://hooks.slack.com/services/..."></div>
        <div style="display:flex;gap:6px"><button class="s-btn s-btn-purple" onclick="saveSlack()">저장</button><button class="s-btn s-btn-green" onclick="testSlack()">테스트</button><button class="s-btn s-btn-red" onclick="removeSlack()">해제</button></div>
        <div id="slack-result" class="s-result"></div>
      </div>
      <!-- Filter -->
      <div class="card">
        <h3><i class="fas fa-filter text-purple-500"></i> 알림 필터</h3>
        <p style="font-size:11px;color:#94a3b8;margin:0 0 8px">아래 키워드가 포함된 메시지는 알림이 발생하지 않고, 채팅 목록에서 회색 처리됩니다.</p>
        <textarea id="filter-keywords" rows="3" placeholder="결제가 완료되었어요&#10;상품 준비중"></textarea>
        <div style="margin-top:8px"><button class="s-btn s-btn-blue" onclick="saveFilters()">저장</button></div>
        <div id="filter-result" class="s-result"></div>
      </div>
    </div>

    <!-- Tab: Guide -->
    <div class="settings-panel" id="tab-guide" style="display:none">
      <!-- 사용법 -->
      <div class="card">
        <h3><i class="fas fa-play-circle text-green-500"></i> 사용법 4단계</h3>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:4px;">
          <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 14px;background:#f0fdf4;border-radius:10px;border-left:3px solid #22c55e">
            <span style="font-weight:800;font-size:18px;color:#22c55e;flex-shrink:0">1</span>
            <div><strong style="font-size:13px">슬랙/텔레그램 알림 확인</strong><p style="font-size:12px;color:#64748b;margin:2px 0 0">판매자가 메시지를 보내면 알림이 옵니다</p></div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 14px;background:#eff6ff;border-radius:10px;border-left:3px solid #3b82f6">
            <span style="font-weight:800;font-size:18px;color:#3b82f6;flex-shrink:0">2</span>
            <div><strong style="font-size:13px">이 대시보드에 접속</strong><p style="font-size:12px;color:#64748b;margin:2px 0 0">좌측 목록에 <span style="color:#22c55e;font-weight:700">답장 필요</span> 뱃지가 붙은 채팅이 보입니다</p></div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 14px;background:#fff7ed;border-radius:10px;border-left:3px solid #f97316">
            <span style="font-weight:800;font-size:18px;color:#f97316;flex-shrink:0">3</span>
            <div><strong style="font-size:13px">채팅방 클릭</strong><p style="font-size:12px;color:#64748b;margin:2px 0 0">오른쪽에 대화 내용이 표시됩니다</p></div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 14px;background:#fdf4ff;border-radius:10px;border-left:3px solid #a855f7">
            <span style="font-weight:800;font-size:18px;color:#a855f7;flex-shrink:0">4</span>
            <div><strong style="font-size:13px">하단 입력창에 답장 입력 → Enter</strong><p style="font-size:12px;color:#64748b;margin:2px 0 0">번개장터 앱을 열 필요 없이 바로 전송됩니다</p></div>
          </div>
        </div>
      </div>

      <!-- 알림 규칙 -->
      <div class="card">
        <h3><i class="fas fa-bell text-yellow-500"></i> 알림 규칙</h3>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px;">
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f0fdf4;border-radius:8px;font-size:13px;font-weight:600">
            <span style="font-size:18px">✅</span> 판매자가 보낸 실질적인 메시지 → <span style="color:#16a34a">알림 옴</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f8fafc;border-radius:8px;font-size:13px;color:#94a3b8">
            <span style="font-size:18px">🔇</span> 내(veasly)가 보낸 답장 → 알림 안 감
          </div>
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f8fafc;border-radius:8px;font-size:13px;color:#94a3b8">
            <span style="font-size:18px">🔇</span> 결제완료, 배송완료, 운송장등록 등 시스템 메시지 → 알림 안 감
          </div>
        </div>
        <p style="font-size:11px;color:#94a3b8;margin-top:10px">※ 필터 키워드는 <strong>설정</strong> 탭에서 추가/수정 가능</p>
      </div>

      <!-- 핵심 기능 -->
      <div class="card">
        <h3><i class="fas fa-star text-orange-500"></i> 핵심 기능</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px;">
          <div style="padding:12px;background:#f8fafc;border-radius:8px;text-align:center">
            <div style="font-size:22px;margin-bottom:4px">🎯</div>
            <div style="font-size:12px;font-weight:700">스마트 필터</div>
            <div style="font-size:11px;color:#94a3b8">답장 필요한 채팅만 표시</div>
          </div>
          <div style="padding:12px;background:#f8fafc;border-radius:8px;text-align:center">
            <div style="font-size:22px;margin-bottom:4px">🔍</div>
            <div style="font-size:12px;font-weight:700">채팅 검색</div>
            <div style="font-size:11px;color:#94a3b8">판매자명/내용으로 검색</div>
          </div>
          <div style="padding:12px;background:#f8fafc;border-radius:8px;text-align:center">
            <div style="font-size:22px;margin-bottom:4px">⚡</div>
            <div style="font-size:12px;font-weight:700">바로 답장</div>
            <div style="font-size:11px;color:#94a3b8">입력 → Enter로 즉시 전송</div>
          </div>
          <div style="padding:12px;background:#f8fafc;border-radius:8px;text-align:center">
            <div style="font-size:22px;margin-bottom:4px">📱</div>
            <div style="font-size:12px;font-weight:700">모바일 지원</div>
            <div style="font-size:11px;color:#94a3b8">폰/태블릿에서도 사용 가능</div>
          </div>
        </div>
      </div>

      <!-- FAQ -->
      <div class="card">
        <h3><i class="fas fa-question-circle text-blue-500"></i> 자주 묻는 질문</h3>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:4px;">
          <div style="padding:10px 14px;background:#f8fafc;border-radius:8px">
            <div style="font-size:12px;font-weight:700;color:#f97316;margin-bottom:3px">Q. 답장이 안 돼요</div>
            <div style="font-size:12px;color:#64748b">상단에 "답장 ON" 뱃지 확인. "답장 OFF"면 관리자에게 토큰 재등록 요청</div>
          </div>
          <div style="padding:10px 14px;background:#f8fafc;border-radius:8px">
            <div style="font-size:12px;font-weight:700;color:#f97316;margin-bottom:3px">Q. 채팅이 안 보여요</div>
            <div style="font-size:12px;color:#64748b">좌측 상단 "폴링" 버튼을 눌러 수동 새로고침. 그래도 안 되면 관리자에게 문의</div>
          </div>
          <div style="padding:10px 14px;background:#f8fafc;border-radius:8px">
            <div style="font-size:12px;font-weight:700;color:#f97316;margin-bottom:3px">Q. 모바일에서도 되나요?</div>
            <div style="font-size:12px;color:#64748b">네. 채팅 목록 → 대화방이 전체화면으로 전환됩니다. ← 버튼으로 뒤로 이동</div>
          </div>
          <div style="padding:10px 14px;background:#f8fafc;border-radius:8px">
            <div style="font-size:12px;font-weight:700;color:#f97316;margin-bottom:3px">Q. 필터 키워드를 추가하고 싶어요</div>
            <div style="font-size:12px;color:#64748b">설정 탭 > 알림 필터에서 키워드를 한 줄에 하나씩 입력 후 저장</div>
          </div>
        </div>
      </div>

      <!-- 주의사항 -->
      <div class="card" style="background:#fffbeb;border:1px solid #fde68a">
        <h3 style="color:#b45309"><i class="fas fa-exclamation-triangle text-yellow-500"></i> 주의사항</h3>
        <ul style="font-size:12px;color:#92400e;margin:0;padding-left:18px;line-height:1.8">
          <li>이 URL은 <strong>팀 내부 전용</strong>입니다. 외부에 공유하지 마세요</li>
          <li>답장 전송은 veasly 계정으로 발송됩니다</li>
          <li>자동 폴링 간격: 3분 / 대시보드 자동 새로고침: 30초</li>
        </ul>
      </div>
    </div>

    <!-- Tab: Logs -->
    <div class="logs-panel" id="tab-logs" style="display:none">
      <div style="padding:20px;text-align:center;color:#94a3b8">로딩 중...</div>
    </div>
  </div>

  <!-- CHATROOM -->
  <div class="chatroom" id="chatroom">
    <div class="cr-empty" id="cr-empty">
      <i class="fas fa-comments"></i>
      <div>채팅방을 선택하세요</div>
      <div style="font-size:13px">좌측 목록에서 대화방을 클릭하면<br>채팅 기록을 볼 수 있습니다</div>
    </div>
    <div id="cr-active" style="display:none;flex-direction:column;height:100%;">
      <div class="cr-header" id="cr-header">
        <button class="back-btn" onclick="closeChat()"><i class="fas fa-arrow-left"></i></button>
        <div class="cr-header-info">
          <div class="cr-header-name" id="cr-name">-</div>
          <div class="cr-header-sub" id="cr-sub">-</div>
        </div>
        <div class="cr-header-actions">
          <button onclick="refreshMessages()"><i class="fas fa-sync-alt mr-1"></i>새로고침</button>
        </div>
      </div>
      <div class="cr-messages" id="cr-messages">
        <div class="msg-loading"><i class="fas fa-spinner fa-spin mr-2"></i>메시지 로딩 중...</div>
      </div>
      <div id="cr-input-area"></div>
    </div>
  </div>
</div>

<script>
const API = '';
let G = {
  myUid: '', replyEnabled: false, chats: [], ignoreKeywords: [],
  activeChannel: null, activeOtherUid: null, activeNickname: '', msgPollTimer: null,
  filterMode: 'reply', // 'reply' = 답장 필요만, 'all' = 전체 보기
  searchQuery: '',
  serverSearchMode: false, searchMeta: null,
};

// ══════════ API ══════════
function isProductSearchQuery(q) {
  if (!q) return false;
  var text = String(q).trim();

  // 1) 숫자만 6~15자리면 상품번호로 판단
  var n = text.length;
  if (n >= 6 && n <= 15) {
    var allDigits = true;
    for (var i = 0; i < n; i++) {
      var code = text.charCodeAt(i);
      if (code < 48 || code > 57) {
        allDigits = false;
        break;
      }
    }
    if (allDigits) return true;
  }

  // 2) 번개장터 상품 URL: /products/ 뒤에 숫자가 있으면 상품 URL로 판단
  var marker = '/products/';
  var pos = text.indexOf(marker);
  if (pos >= 0) {
    var rest = text.slice(pos + marker.length);
    var digitCount = 0;

    for (var j = 0; j < rest.length; j++) {
      var code2 = rest.charCodeAt(j);
      if (code2 >= 48 && code2 <= 57) {
        digitCount++;
      } else {
        break;
      }
    }

    return digitCount >= 6 && digitCount <= 15;
  }

  return false;
}

function buildSearchApiUrl(q) {
  var text = String(q || '').trim();

  if (isProductSearchQuery(text)) {
    return '/api/deep-search-chats?q=' + encodeURIComponent(text) + '&limit=300&message_limit=100&fetch_limit=40&offset=0';
  }

  return '/api/search-chats?q=' + encodeURIComponent(text) + '&limit=300';
}
async function api(path, opts={}) {
  const r = await fetch(API + path, { ...opts, headers: { 'Content-Type':'application/json', ...(opts.headers||{}) }});
  return r.json();
}

// ══════════ TAB SWITCH ══════════
function switchTab(t) {
  document.querySelectorAll('.tab-item').forEach(e => e.classList.toggle('active', e.dataset.tab===t));
  document.getElementById('tab-chats').style.display = t==='chats'?'flex':'none';
  document.getElementById('tab-guide').style.display = t==='guide'?'':'none';
  document.getElementById('tab-settings').style.display = t==='settings'?'':'none';
  document.getElementById('tab-logs').style.display = t==='logs'?'':'none';
  if (t==='logs') loadLogs();
}

// ══════════ STATUS ══════════
async function loadStatus() {
  try {
    const {status} = await api('/api/status');
    G.myUid = status.uid || '';
    const el = document.getElementById('sb-status');
    let h = '';
    h += status.has_token ? '<span class="sb-badge sb-badge-on">토큰 OK</span>' : '<span class="sb-badge sb-badge-off">토큰 없음</span>';
    h += status.has_telegram ? '<span class="sb-badge sb-badge-on">TG</span>' : '';
    h += status.has_slack ? '<span class="sb-badge sb-badge-on">Slack</span>' : '';
    h += status.has_reply ? '<span class="sb-badge sb-badge-on">답장 ON</span>' : '<span class="sb-badge sb-badge-off">답장 OFF</span>';
    h += '<span class="sb-badge sb-badge-info">' + (status.tracked_chats||0) + '개 채팅</span>';
    el.innerHTML = h;
    G.replyEnabled = status.has_reply;
    const tgB = document.getElementById('badge-tg');
    tgB.className = 'sb-badge ' + (status.has_telegram?'sb-badge-on':'sb-badge-off');
    tgB.textContent = status.has_telegram?'ON':'OFF';
    const slB = document.getElementById('badge-slack');
    slB.className = 'sb-badge ' + (status.has_slack?'sb-badge-on':'sb-badge-off');
    slB.textContent = status.has_slack?'ON':'OFF';
    if (status.ignore_keywords?.length) document.getElementById('filter-keywords').value = status.ignore_keywords.join('\\n');
  } catch(e) { console.error(e); }
}

// ══════════ CHAT LIST ══════════
async function loadChats() {
  try {
    const data = await api('/api/recent-chats?limit=300');
    if (!data.ok) return;
    G.serverSearchMode = false;
    G.searchMeta = null;
    G.chats = data.chats || [];
    G.myUid = data.my_uid || G.myUid;
    G.replyEnabled = data.reply_enabled;
    G.ignoreKeywords = data.ignore_keywords || [];
    renderChatList();
  } catch(e) { console.error(e); }
}

// ── 검색 ──
window.onSearch = function() {
  G.searchQuery = (document.getElementById('search-input').value || '').trim().toLowerCase();
  renderChatList();
}

// ── 서버사이드 검색: 현재 채팅 + 아카이브까지 검색 ──
// 기존 onSearch 함수보다 뒤에 선언하여 동일 이름 함수를 덮어쓴다.
window.onSearch = function() {
  G.searchQuery = (document.getElementById('search-input').value || '').trim().toLowerCase();

  // 검색 시에는 "답장 필요만" 필터 때문에 결과가 숨겨지지 않도록 전체 보기로 자동 전환
  if (G.searchQuery && G.filterMode === 'reply') {
    G.filterMode = 'all';
    document.getElementById('chip-reply').className = 'filter-chip';
    document.getElementById('chip-all').className = 'filter-chip active';
  }

  if (window.__searchTimer) clearTimeout(window.__searchTimer);

  if (!G.searchQuery) {
    loadChats();
    return;
  }

  window.__searchTimer = setTimeout(runServerSearch, 250);
  renderChatList();
}

async function runServerSearch() {
  try {
    var inputEl = document.getElementById('search-input');
    var rawInput = String((inputEl && inputEl.value) || '').trim();
    var area = document.getElementById('chat-list-area');

    if (!rawInput) {
      G.serverSearchMode = false;
      G.searchMeta = null;
      await loadChats();
      return;
    }

    // 상품번호/상품 URL은 현재 recent-chats 개수를 기준으로 전체 구간 자동 딥서치
    if (isProductSearchQuery(rawInput)) {
      G.serverSearchMode = true;
      G.searchMeta = {
        type: 'product',
        query: rawInput,
        loading: true
      };

      if (area) {
        area.innerHTML =
          '<div style="padding:32px;text-align:center;color:#64748b">' +
          '<i class="fas fa-spinner fa-spin"></i>' +
          '<div style="font-weight:700;color:#475569;margin-top:8px">상품번호 딥서치 준비 중...</div>' +
          '<div style="font-size:12px;margin-top:6px">최근 채팅방 수를 확인하고 있습니다.</div>' +
          '</div>';
      }

      var fetchLimit = 40;
      var messageLimit = 100;
      var totalChannels = 0;

      try {
        var recent = await api('/api/recent-chats?limit=300');
        if (recent && recent.ok && recent.chats && typeof recent.chats.length === 'number') {
          totalChannels = recent.chats.length;
        }
      } catch (recentErr) {
        console.warn('recent-chats count check failed', recentErr);
      }

      // fallback: recent count를 못 가져오면 기존보다 넉넉하게 300 기준으로 조회
      if (!totalChannels || totalChannels < 1) {
        totalChannels = 300;
      }

      var offsets = [];
      for (var off = 0; off < totalChannels; off += fetchLimit) {
        offsets.push(off);
      }
      if (!offsets.length) offsets.push(0);

      var merged = {};
      var totalFetched = 0;
      var totalMessageMatches = 0;
      var totalSummaryMatches = 0;
      var maxScanned = 0;
      var errors = [];

      for (var i = 0; i < offsets.length; i++) {
        var offset = offsets[i];

        if (area) {
          area.innerHTML =
            '<div style="padding:32px;text-align:center;color:#64748b">' +
            '<i class="fas fa-spinner fa-spin"></i>' +
            '<div style="font-weight:700;color:#475569;margin-top:8px">상품번호 딥서치 중...</div>' +
            '<div style="font-size:12px;margin-top:6px">구간 ' + (i + 1) + '/' + offsets.length + ' · offset=' + offset + '</div>' +
            '<div style="font-size:11px;margin-top:4px;color:#94a3b8">검색어: ' + esc(rawInput) + '</div>' +
            '<div style="font-size:11px;margin-top:4px;color:#94a3b8">대상 채팅방: 약 ' + totalChannels + '개 · 구간당 최대 ' + fetchLimit + '개</div>' +
            '</div>';
        }

        var url =
          '/api/deep-search-chats?q=' +
          encodeURIComponent(rawInput) +
          '&limit=' + encodeURIComponent(String(totalChannels)) +
          '&message_limit=' + encodeURIComponent(String(messageLimit)) +
          '&fetch_limit=' + encodeURIComponent(String(fetchLimit)) +
          '&offset=' + encodeURIComponent(String(offset));

        var data = await api(url);

        if (!data || data.ok === false) {
          errors.push({
            offset: offset,
            error: data && data.error ? data.error : 'deep_search_failed'
          });
          continue;
        }

        maxScanned = Math.max(maxScanned, Number(data.scanned_channels || 0));
        totalFetched += Number(data.fetched_channels || 0);
        totalMessageMatches += Number(data.message_matches || 0);
        totalSummaryMatches += Number(data.summary_matches || 0);

        if (data.errors && data.errors.length) {
          for (var e = 0; e < data.errors.length; e++) {
            errors.push(data.errors[e]);
          }
        }

        var chats = data.chats || [];
        for (var c = 0; c < chats.length; c++) {
          var chat = chats[c];
          if (chat && chat.channel_id) {
            merged[chat.channel_id] = chat;
          }
        }
      }

      var resultChats = Object.keys(merged).map(function(k) { return merged[k]; });
      resultChats.sort(function(a, b) {
        return new Date(b.last_time || 0).getTime() - new Date(a.last_time || 0).getTime();
      });

      G.chats = resultChats;
      G.serverSearchMode = true;
      G.searchMeta = {
        type: 'product',
        query: rawInput,
        totalChannels: totalChannels,
        scannedChannels: maxScanned || totalChannels,
        fetchedChannels: totalFetched,
        summaryMatches: totalSummaryMatches,
        messageMatches: totalMessageMatches,
        errors: errors,
        offsets: offsets
      };

      if (resultChats.length > 0) {
        renderChatList();
        return;
      }

      if (area) {
        area.innerHTML =
          '<div style="padding:28px;text-align:center;color:#64748b">' +
          '<i class="fas fa-search" style="font-size:26px;color:#cbd5e1;margin-bottom:10px"></i>' +
          '<div style="font-weight:800;color:#475569;margin-bottom:6px">상품번호 검색 결과 없음</div>' +
          '<div style="font-size:12px;line-height:1.8;color:#64748b">' +
          '검색어: <strong>' + esc(rawInput) + '</strong><br>' +
          '확인한 채팅방: <strong>' + esc(String(maxScanned || totalChannels)) + '</strong>개<br>' +
          '본문 조회 완료: <strong>' + esc(String(totalFetched)) + '</strong>개<br>' +
          '메시지 범위: 각 채팅방 최근 <strong>' + esc(String(messageLimit)) + '</strong>개<br>' +
          '조회 구간: <strong>' + esc(String(offsets.length)) + '</strong>개<br>' +
          '오류: <strong>' + esc(String(errors.length)) + '</strong>개' +
          '</div>' +
          '<div style="font-size:12px;margin-top:10px;color:#f97316;font-weight:700">' +
          '현재 저장된 채팅 데이터 안에는 해당 상품번호/URL이 없습니다.' +
          '</div>' +
          '<div style="font-size:11px;margin-top:6px;color:#94a3b8">' +
          '상품명, 판매자 닉네임, 구매자 닉네임 또는 대화 내 고유 키워드로 다시 검색해 주세요.' +
          '</div>' +
          '</div>';
      }

      return;
    }

    // 일반 검색어는 기존 서버 검색 사용
    var data2 = await api('/api/search-chats?q=' + encodeURIComponent(rawInput) + '&limit=300');

    if (!data2 || data2.ok === false) {
      throw new Error(data2 && data2.error ? data2.error : 'search_failed');
    }

    G.chats = data2.chats || [];
    G.serverSearchMode = true;
    G.searchMeta = {
      type: 'text',
      query: rawInput,
      count: G.chats.length
    };

    renderChatList();
  } catch (err) {
    console.error('runServerSearch failed', err);

    var area2 = document.getElementById('chat-list-area');
    if (area2) {
      area2.innerHTML =
        '<div style="padding:24px;text-align:center;color:#ef4444">' +
        '<i class="fas fa-triangle-exclamation"></i>' +
        '<div style="font-weight:700;margin-top:8px">검색 중 오류가 발생했습니다.</div>' +
        '<div style="font-size:12px;margin-top:6px;color:#991b1b">' + esc(String(err && err.message ? err.message : err)) + '</div>' +
        '</div>';
    }
  }
}
// ── 필터 토글 ──
function toggleFilter(mode) {
  G.filterMode = mode;
  document.getElementById('chip-reply').className = 'filter-chip' + (mode==='reply'?' active-green':'');
  document.getElementById('chip-all').className = 'filter-chip' + (mode==='all'?' active':'');
  renderChatList();
}


function clearSearchAndLoad() {
  var input = document.getElementById('search-input');
  if (input) input.value = '';

  G.searchQuery = '';
  G.serverSearchMode = false;
  G.searchMeta = null;

  loadChats();
}
function renderChatList() {
  const el = document.getElementById('chat-list-area');
  if (!G.chats.length) {
    var countEl = document.getElementById('filter-count');
    if (countEl) countEl.textContent = '';

    if (G.searchQuery || G.serverSearchMode) {
      var metaHtml = '';

      if (G.searchQuery) {
        metaHtml += '<div style="font-size:12px;margin-top:6px;color:#64748b">검색어: <strong>' + escH(G.searchQuery) + '</strong></div>';
      }

      if (G.searchMeta && G.searchMeta.type === 'product') {
        metaHtml += '<div style="font-size:11px;margin-top:6px;color:#94a3b8">상품번호/URL 딥서치 결과가 없습니다.</div>';
      } else {
        metaHtml += '<div style="font-size:11px;margin-top:6px;color:#94a3b8">닉네임, UID, 마지막 메시지에서 일치 항목이 없습니다.</div>';
      }

      el.innerHTML =
        '<div class="no-results">' +
        '<i class="fas fa-search"></i>' +
        '<div style="font-weight:800;margin-top:8px">검색 결과가 없습니다</div>' +
        metaHtml +
        '<button style="margin-top:12px;padding:7px 12px;border-radius:999px;border:1px solid #fed7aa;background:#fff7ed;color:#f97316;font-size:12px;font-weight:800;cursor:pointer" onclick="clearSearchAndLoad()">' +
        '<i class="fas fa-rotate-left"></i> 검색 초기화' +
        '</button>' +
        '</div>';
      return;
    }

    el.innerHTML =
      '<div class="no-results">' +
      '<i class="fas fa-inbox"></i>' +
      '<div style="font-weight:800;margin-top:8px">채팅이 없습니다</div>' +
      '<div style="font-size:12px;margin-top:6px;color:#94a3b8">수동 폴링을 실행하거나 잠시 후 다시 확인하세요.</div>' +
      '</div>';
    return;
  }
  // 필터링 적용
  let visible = G.chats;

  // 검색어 필터
  if (G.searchQuery && !G.serverSearchMode) {
    visible = visible.filter(c => {
      const nick = (c.nickname||'').toLowerCase();
      const uid = (c.other_id||'').toLowerCase();
      const msg = (c.last_message||'').toLowerCase();
      return nick.includes(G.searchQuery) || uid.includes(G.searchQuery) || msg.includes(G.searchQuery);
    });
  }

  // 모드 필터
  if (G.filterMode === 'reply') {
    visible = visible.filter(c => c.needs_reply);
  }

  // 카운트 표시
  const totalReply = G.chats.filter(c => c.needs_reply).length;
  const totalFiltered = G.chats.filter(c => c.is_filtered).length;
  document.getElementById('filter-count').textContent =
    '답장 필요 ' + totalReply + ' · 필터 ' + totalFiltered + ' · 전체 ' + G.chats.length;

  if (!visible.length) {
    el.innerHTML = '<div class="no-results"><i class="fas fa-search"></i>' +
      (G.searchQuery ? '검색 결과가 없습니다' : (G.filterMode==='reply'?'답장이 필요한 채팅이 없습니다':'채팅이 없습니다')) +
      '</div>';
    return;
  }

  el.innerHTML = visible.map(c => {
    const init = (c.nickname||'?')[0];
    const isActive = G.activeChannel === c.channel_id;
    const isMine = c.sender_id === G.myUid;
    const prefix = isMine ? '<span class="my-prefix">나: </span>' : '';
    const isFiltered = c.is_filtered;
    const needsReply = c.needs_reply;

    let cls = 'chat-item';
    if (isActive) cls += ' active';
    if (needsReply) cls += ' needs-reply';
    if (isFiltered) cls += ' filtered';

    let badges = '';
    if (needsReply) badges += '<span class="reply-badge">답장 필요</span>';
    if (isFiltered) badges += '<span class="filtered-badge">필터</span>';

    return '<div class="'+cls+'" data-channel-id="'+escA(c.channel_id)+'" data-other-id="'+escA(c.other_id)+'" data-nickname="'+escA(c.nickname)+'" onclick="openChat(this.dataset.channelId,this.dataset.otherId,this.dataset.nickname)">'+
      '<div class="chat-avatar'+(isFiltered?' filtered-av':'')+'">'+escH(init)+'</div>'+
      '<div class="chat-meta">'+
        '<div><span class="chat-name">'+escH(c.nickname)+'</span><span class="chat-uid">'+escH(c.other_id)+'</span></div>'+
        '<div class="chat-last">'+prefix+escH(c.last_message||'(메시지 없음)')+'</div>'+
      '</div>'+
      '<div class="chat-time-col"><div class="chat-time">'+fmtTime(c.last_time)+'</div>'+badges+'</div>'+
    '</div>';
  }).join('');
}

// ══════════ OPEN CHAT ══════════
async function openChat(channelId, otherUid, nickname) {
  G.activeChannel = channelId;
  G.activeOtherUid = otherUid;
  G.activeNickname = nickname;
  renderChatList();

  document.getElementById('cr-empty').style.display = 'none';
  const active = document.getElementById('cr-active');
  active.style.display = 'flex';
  document.getElementById('chatroom').classList.add('open');

  document.getElementById('cr-name').textContent = nickname;
  document.getElementById('cr-sub').textContent = 'UID: ' + otherUid + ' · 채널: ' + channelId;
  document.getElementById('cr-messages').innerHTML = '<div class="msg-loading"><i class="fas fa-spinner fa-spin mr-2"></i>메시지 로딩 중...</div>';

  renderInputArea();
  await loadMessages(channelId);

  clearInterval(G.msgPollTimer);
  G.msgPollTimer = setInterval(() => loadMessages(channelId, true), 15000);
}

function closeChat() {
  G.activeChannel = null;
  clearInterval(G.msgPollTimer);
  document.getElementById('cr-empty').style.display = '';
  document.getElementById('cr-active').style.display = 'none';
  document.getElementById('chatroom').classList.remove('open');
  renderChatList();
}

function renderInputArea() {
  const area = document.getElementById('cr-input-area');
  if (!G.replyEnabled) {
    area.innerHTML = '<div class="cr-input-disabled"><i class="fas fa-lock mr-1"></i>답장 기능 비활성화 — start.bat을 실행하여 토큰을 등록하세요</div>';
    return;
  }
  area.innerHTML = '<div class="cr-input">'+
    '<textarea id="msg-input" rows="1" placeholder="메시지를 입력하세요..." onkeydown="handleMsgKey(event)" oninput="autoGrow(this)"></textarea>'+
    '<button class="send-btn" id="send-btn" onclick="sendMessage()"><i class="fas fa-paper-plane"></i></button>'+
  '</div>';
}

// ══════════ LOAD MESSAGES ══════════
async function loadMessages(channelId, silent) {
  if (channelId !== G.activeChannel) return;
  try {
    const data = await api('/api/messages/' + encodeURIComponent(channelId));
    if (!data.ok || channelId !== G.activeChannel) return;
    const el = document.getElementById('cr-messages');
    const wasAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    renderMessages(data.messages || [], data.my_uid);
    if (!silent || wasAtBottom) el.scrollTop = el.scrollHeight;
  } catch(e) {
    if (!silent) document.getElementById('cr-messages').innerHTML = '<div class="msg-loading" style="color:#dc2626"><i class="fas fa-exclamation-triangle mr-2"></i>메시지 로드 실패</div>';
  }
}

function renderMessages(msgs, myUid) {
  const el = document.getElementById('cr-messages');
  if (!msgs.length) { el.innerHTML = '<div class="msg-loading">아직 메시지가 없습니다</div>'; return; }

  let html = '';
  let lastDate = '';
  msgs.forEach(m => {
    const d = m.created_at ? new Date(m.created_at) : null;
    const dateStr = d ? d.toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'}) : '';
    if (dateStr && dateStr !== lastDate) {
      html += '<div class="msg-date-sep"><span>'+escH(dateStr)+'</span></div>';
      lastDate = dateStr;
    }
    const isMine = String(m.sender_id) === String(myUid);
    const timeStr = d ? d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}) : '';

    const mtype = m.message_type;
    if (mtype && mtype > 14 && mtype !== 70 && mtype !== 80) {
      html += '<div class="msg-system">'+escH(m.content)+'</div>';
      return;
    }

    html += '<div class="msg-row '+(isMine?'mine':'theirs')+'">';
    html += '<div class="msg-bubble">'+escH(m.content)+'</div>';
    if (timeStr) html += '<div class="msg-time">'+timeStr+'</div>';
    html += '</div>';
  });
  el.innerHTML = html;
}

function refreshMessages() {
  if (G.activeChannel) loadMessages(G.activeChannel);
}

// ══════════ SEND MESSAGE ══════════
async function sendMessage() {
  const input = document.getElementById('msg-input');
  const btn = document.getElementById('send-btn');
  const msg = input.value.trim();
  if (!msg || !G.activeOtherUid) return;

  btn.disabled = true;
  input.disabled = true;

  try {
    const res = await api('/api/reply', {
      method: 'POST',
      body: JSON.stringify({ channel_id: G.activeChannel, target_uid: G.activeOtherUid, message: msg }),
    });
    if (res.ok) {
      input.value = '';
      input.style.height = 'auto';
      const el = document.getElementById('cr-messages');
      const now = new Date();
      const timeStr = now.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
      el.innerHTML += '<div class="msg-row mine"><div class="msg-bubble">'+escH(msg)+'</div><div class="msg-time">'+timeStr+'</div></div>';
      el.scrollTop = el.scrollHeight;
      setTimeout(() => { loadMessages(G.activeChannel, true); loadChats(); }, 2000);

      alert(res.error || '전송 실패');
    }
  } catch(e) { alert('네트워크 오류'); }
  btn.disabled = false;
  input.disabled = false;
  input.focus();
}

function handleMsgKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}
function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ══════════ SETTINGS FUNCTIONS ══════════
async function saveToken() {
  const el = document.getElementById('token-result');
  try {
    const data = JSON.parse(document.getElementById('token-json').value.trim());
    const res = await api('/api/token', { method:'POST', body:JSON.stringify(data) });
    let msg = res.ok ? res.message : res.error;
    if (data.bun_auth_token || data.talk_id_token) {
      const bunRes = await api('/api/bun-token', { method:'POST', body:JSON.stringify({ bun_auth_token:data.bun_auth_token||'', talk_id_token:data.talk_id_token||'' }) });
      if (bunRes.ok) msg += ' + 답장 활성화!';
    }
    el.innerHTML = res.ok ? ok(msg) : err(msg);
    if (res.ok) loadAll();
  } catch(e) { el.innerHTML = err('JSON 형식 오류'); }
}
async function saveTelegram() {
  const t = document.getElementById('tg-token').value.trim(), c = document.getElementById('tg-chat').value.trim();
  if (!t||!c) { document.getElementById('tg-result').innerHTML = err('Bot Token과 Chat ID 필요'); return; }
  const res = await api('/api/config',{method:'POST',body:JSON.stringify({telegram_bot_token:t,telegram_chat_id:c})});
  document.getElementById('tg-result').innerHTML = ok(res.message); loadStatus();
}
async function testTelegram() {
  document.getElementById('tg-result').innerHTML = '<span style="color:#2563eb"><i class="fas fa-spinner fa-spin mr-1"></i>전송 중...</span>';
  const res = await api('/api/test-notify',{method:'POST',body:JSON.stringify({channel:'telegram'})});
  document.getElementById('tg-result').innerHTML = res.ok ? ok('테스트 전송 완료!') : err(res.error);
}
async function saveSlack() {
  const w = document.getElementById('slack-webhook').value.trim();
  if (!w) { document.getElementById('slack-result').innerHTML = err('Webhook URL 필요'); return; }
  const res = await api('/api/config',{method:'POST',body:JSON.stringify({slack_webhook_url:w})});
  document.getElementById('slack-result').innerHTML = ok(res.message); loadStatus();
}
async function testSlack() {
  document.getElementById('slack-result').innerHTML = '<span style="color:#2563eb"><i class="fas fa-spinner fa-spin mr-1"></i>전송 중...</span>';
  const res = await api('/api/test-notify',{method:'POST',body:JSON.stringify({channel:'slack'})});
  document.getElementById('slack-result').innerHTML = res.ok ? ok('테스트 전송 완료!') : err(res.error);
}
async function removeSlack() {
  if (!confirm('슬랙 연결을 해제하시겠습니까?')) return;
  await api('/api/config',{method:'POST',body:JSON.stringify({slack_webhook_url:'__REMOVE__'})});
  document.getElementById('slack-webhook').value = '';
  document.getElementById('slack-result').innerHTML = '<span style="color:#64748b">연결 해제됨</span>'; loadStatus();
}
async function saveFilters() {
  const kw = document.getElementById('filter-keywords').value.trim().split('\\n').map(s=>s.trim()).filter(Boolean);
  await api('/api/config',{method:'POST',body:JSON.stringify({ignore_keywords:kw})});
  document.getElementById('filter-result').innerHTML = ok(kw.length+'개 필터 저장');
  loadChats(); // 필터 즉시 반영
}

// ══════════ POLL / RESET ══════════
async function triggerPoll(btn) {
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  const res = await api('/api/trigger',{method:'POST'});
  btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i>폴링';
  alert('새 메시지 '+(res.result?.new_messages||0)+'건 / 총 '+(res.result?.total_chats||0)+'개 채팅방');
  loadAll();
}
async function resetState() {
  if (!confirm('채팅 상태를 초기화하시겠습니까?')) return;
  await api('/api/reset',{method:'POST'}); alert('초기화 완료'); loadAll();
}

// ══════════ LOGS ══════════
async function loadLogs() {
  try {
    const {logs} = await api('/api/logs');
    const el = document.getElementById('tab-logs');
    if (!logs?.length) { el.innerHTML = '<div style="padding:20px;text-align:center;color:#94a3b8">로그 없음</div>'; return; }
    el.innerHTML = logs.map(l => {
      let cls = '';
      if (l.includes('[ERROR]')) cls = 'err';
      else if (l.includes('[NEW')) cls = 'new';
      else if (l.includes('[REPLY]')) cls = 'reply';
      else if (l.includes('[INIT]')) cls = 'init';
      return '<div class="log-line '+cls+'">'+escH(l)+'</div>';
    }).join('');
  } catch(e) { console.error(e); }
}

// ══════════ HELPERS ══════════
function escH(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escA(s) { return (s||'').replace(/'/g,"\\\\'").replace(/"/g,'&quot;'); }
function esc(s) { return (s||'').replace(/'/g,"\\\\'"); }
function ok(m) { return '<span style="color:#16a34a"><i class="fas fa-check mr-1"></i>'+escH(m)+'</span>'; }
function err(m) { return '<span style="color:#dc2626"><i class="fas fa-times mr-1"></i>'+escH(m)+'</span>'; }
function fmtTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts), now = new Date(), diff = now - d;
    if (diff < 60000) return '방금';
    if (diff < 3600000) return Math.floor(diff/60000)+'분 전';
    if (diff < 86400000) return d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
    return d.toLocaleDateString('ko-KR',{month:'short',day:'numeric'});
  } catch { return ''; }
}

// ══════════ INIT ══════════
function loadAll() { loadStatus(); loadChats(); }
loadAll();
setInterval(() => { loadStatus(); loadChats(); }, 30000);
</script>
</body>
</html>`;


















