export const GUIDE_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>번개장터 채팅 모니터 v6.0 - 팀 가이드</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #fff; overflow: hidden; }
  
  .slides { width: 100vw; height: 100vh; position: relative; }
  .slide { width: 100%; height: 100%; position: absolute; top: 0; left: 0; opacity: 0; transition: opacity 0.5s; display: flex; flex-direction: column; justify-content: center; padding: 60px 80px; }
  .slide.active { opacity: 1; z-index: 1; }

  /* Nav */
  .nav { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); z-index: 100; display: flex; gap: 10px; align-items: center; background: rgba(15,23,42,.85); backdrop-filter: blur(12px); padding: 10px 24px; border-radius: 99px; border: 1px solid rgba(255,255,255,.1); }
  .nav button { width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer; font-size: 16px; background: rgba(255,255,255,.1); color: #fff; transition: all .2s; display: flex; align-items: center; justify-content: center; }
  .nav button:hover { background: #f97316; }
  .nav .page-info { font-size: 13px; color: #94a3b8; min-width: 50px; text-align: center; }
  .dots { display: flex; gap: 6px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,.2); cursor: pointer; transition: all .2s; }
  .dot.active { background: #f97316; width: 24px; border-radius: 4px; }

  /* Slide styles */
  h1 { font-size: 48px; font-weight: 800; line-height: 1.2; margin-bottom: 16px; }
  h2 { font-size: 36px; font-weight: 800; line-height: 1.3; margin-bottom: 32px; }
  .accent { color: #f97316; }
  .green { color: #22c55e; }
  .sub { font-size: 20px; color: #94a3b8; line-height: 1.6; }
  .tag { display: inline-block; padding: 4px 14px; border-radius: 99px; font-size: 13px; font-weight: 700; }
  .tag-orange { background: rgba(249,115,22,.15); color: #f97316; border: 1px solid rgba(249,115,22,.3); }
  .url-box { font-size: 18px; background: rgba(249,115,22,.1); border: 1px solid rgba(249,115,22,.3); padding: 14px 24px; border-radius: 12px; color: #f97316; font-weight: 700; display: inline-block; margin-top: 20px; }

  /* Cards */
  .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 10px; }
  .card { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); border-radius: 16px; padding: 28px; transition: all .2s; }
  .card-icon { font-size: 28px; margin-bottom: 12px; }
  .card h3 { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
  .card p { font-size: 14px; color: #94a3b8; line-height: 1.6; }

  /* Steps */
  .steps { display: flex; flex-direction: column; gap: 16px; margin-top: 10px; }
  .step { display: flex; align-items: flex-start; gap: 20px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); border-radius: 14px; padding: 22px 28px; }
  .step-num { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, #f97316, #fb923c); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; flex-shrink: 0; }
  .step-text { flex: 1; }
  .step-text h4 { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
  .step-text p { font-size: 13px; color: #94a3b8; }

  /* Alert rules */
  .rules { display: flex; flex-direction: column; gap: 14px; margin-top: 10px; }
  .rule { display: flex; align-items: center; gap: 16px; padding: 18px 24px; border-radius: 12px; font-size: 16px; font-weight: 600; }
  .rule-yes { background: rgba(34,197,94,.1); border: 1px solid rgba(34,197,94,.2); }
  .rule-no { background: rgba(239,68,68,.06); border: 1px solid rgba(239,68,68,.15); color: #94a3b8; }
  .rule-icon { font-size: 24px; flex-shrink: 0; }

  /* FAQ */
  .faqs { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 10px; }
  .faq { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 22px; }
  .faq-q { font-size: 14px; font-weight: 700; color: #f97316; margin-bottom: 8px; }
  .faq-a { font-size: 13px; color: #cbd5e1; line-height: 1.5; }

  /* Status table */
  .status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 10px; }
  .status-item { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 20px; display: flex; align-items: center; gap: 14px; }
  .status-item .si-icon { font-size: 24px; width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .si-on { background: rgba(34,197,94,.15); color: #22c55e; }
  .si-info { background: rgba(59,130,246,.15); color: #3b82f6; }
  .si-warn { background: rgba(249,115,22,.15); color: #f97316; }
  .status-item .si-label { font-size: 12px; color: #64748b; }
  .status-item .si-value { font-size: 16px; font-weight: 700; }

  /* Layout visual */
  .layout-demo { display: flex; gap: 2px; margin-top: 20px; height: 320px; background: rgba(255,255,255,.03); border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,.1); }
  .ld-sidebar { width: 35%; background: rgba(255,255,255,.06); padding: 16px; display: flex; flex-direction: column; gap: 8px; }
  .ld-search { background: rgba(255,255,255,.08); border-radius: 20px; padding: 10px 14px; font-size: 12px; color: #64748b; }
  .ld-filters { display: flex; gap: 6px; }
  .ld-chip { font-size: 10px; padding: 4px 10px; border-radius: 99px; border: 1px solid rgba(34,197,94,.4); color: #22c55e; }
  .ld-chip2 { font-size: 10px; padding: 4px 10px; border-radius: 99px; border: 1px solid rgba(255,255,255,.15); color: #64748b; }
  .ld-chat { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 10px; }
  .ld-chat.active { background: rgba(249,115,22,.1); }
  .ld-chat.filtered { opacity: .4; }
  .ld-avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg,#f97316,#fb923c); flex-shrink: 0; }
  .ld-avatar.gray { background: linear-gradient(135deg,#64748b,#94a3b8); }
  .ld-info { flex: 1; min-width: 0; }
  .ld-name { font-size: 12px; font-weight: 700; }
  .ld-msg { font-size: 10px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ld-badge { font-size: 8px; padding: 2px 6px; border-radius: 99px; background: #22c55e; color: #fff; font-weight: 700; }
  .ld-badge-gray { font-size: 8px; padding: 2px 6px; border-radius: 99px; background: #475569; color: #94a3b8; }
  .ld-chatroom { flex: 1; display: flex; flex-direction: column; background: rgba(232,228,222,.08); }
  .ld-cr-header { padding: 12px 16px; background: rgba(255,255,255,.06); font-size: 13px; font-weight: 700; border-bottom: 1px solid rgba(255,255,255,.06); }
  .ld-cr-msgs { flex: 1; padding: 16px; display: flex; flex-direction: column; gap: 8px; justify-content: flex-end; }
  .ld-bubble { max-width: 65%; padding: 8px 12px; border-radius: 12px; font-size: 11px; line-height: 1.4; }
  .ld-bubble.theirs { background: rgba(255,255,255,.12); align-self: flex-start; border-bottom-left-radius: 4px; }
  .ld-bubble.mine { background: #f97316; align-self: flex-end; border-bottom-right-radius: 4px; }
  .ld-cr-input { padding: 10px 14px; background: rgba(255,255,255,.06); display: flex; gap: 8px; border-top: 1px solid rgba(255,255,255,.06); }
  .ld-cr-input div { flex: 1; background: rgba(255,255,255,.08); border-radius: 20px; padding: 8px 14px; font-size: 11px; color: #64748b; }
  .ld-cr-input span { width: 32px; height: 32px; border-radius: 50%; background: #f97316; display: flex; align-items: center; justify-content: center; font-size: 12px; }

  .warning { margin-top: 24px; background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.2); border-radius: 10px; padding: 14px 20px; font-size: 14px; color: #fca5a5; }

  @media (max-width: 768px) {
    .slide { padding: 30px 24px; }
    h1 { font-size: 28px; }
    h2 { font-size: 24px; }
    .cards { grid-template-columns: 1fr; }
    .faqs { grid-template-columns: 1fr; }
    .status-grid { grid-template-columns: 1fr; }
    .layout-demo { height: auto; flex-direction: column; }
    .ld-sidebar { width: 100%; }
  }
</style>
</head>
<body>
<div class="slides" id="slides">

  <!-- Slide 1: Title -->
  <div class="slide active" data-idx="0">
    <span class="tag tag-orange" style="margin-bottom:20px;">veasly 팀 내부 자료</span>
    <h1>번개장터 채팅 모니터 <span class="accent">v6.0</span></h1>
    <p class="sub">모든 채팅을 한 화면에서 모니터링하고, 바로 답장하세요.<br>번개장터 앱을 열 필요가 없습니다.</p>
    <div class="url-box">https://bunjang-monitor.pages.dev</div>
  </div>

  <!-- Slide 2: What is this -->
  <div class="slide" data-idx="1">
    <h2><span class="accent">이 시스템</span>은 무엇인가요?</h2>
    <div class="cards">
      <div class="card">
        <div class="card-icon">📱</div>
        <h3>한 화면에서 모니터링</h3>
        <p>veasly 번개장터 계정의 모든 채팅을<br>웹 대시보드에서 한눈에 확인</p>
      </div>
      <div class="card">
        <div class="card-icon">🔔</div>
        <h3>스마트 알림</h3>
        <p>판매자가 보낸 메시지만<br>텔레그램 + 슬랙으로 자동 알림</p>
      </div>
      <div class="card">
        <div class="card-icon">💬</div>
        <h3>바로 답장</h3>
        <p>번개장터 앱 없이<br>대시보드에서 직접 메시지 전송</p>
      </div>
      <div class="card">
        <div class="card-icon">☁️</div>
        <h3>24시간 자동 운영</h3>
        <p>클라우드 서버리스로 동작<br>별도 PC 켜둘 필요 없음</p>
      </div>
    </div>
  </div>

  <!-- Slide 3: Layout -->
  <div class="slide" data-idx="2">
    <h2>화면 구성</h2>
    <div class="layout-demo">
      <div class="ld-sidebar">
        <div class="ld-search">🔍 판매자 이름 또는 채팅 내용 검색...</div>
        <div class="ld-filters">
          <span class="ld-chip">✓ 답장 필요만</span>
          <span class="ld-chip2">전체 보기</span>
        </div>
        <div class="ld-chat active">
          <div class="ld-avatar"></div>
          <div class="ld-info"><div class="ld-name">판쿤2호점</div><div class="ld-msg">네 알겠습니다!</div></div>
          <div class="ld-badge">답장 필요</div>
        </div>
        <div class="ld-chat">
          <div class="ld-avatar"></div>
          <div class="ld-info"><div class="ld-name">수원광교매장</div><div class="ld-msg">테스트</div></div>
          <div class="ld-badge">답장 필요</div>
        </div>
        <div class="ld-chat filtered">
          <div class="ld-avatar gray"></div>
          <div class="ld-info"><div class="ld-name">도로로로동</div><div class="ld-msg">운송장 번호가 등록되었어요</div></div>
          <div class="ld-badge-gray">필터</div>
        </div>
      </div>
      <div class="ld-chatroom">
        <div class="ld-cr-header">판쿤2호점 · UID: 5328969</div>
        <div class="ld-cr-msgs">
          <div class="ld-bubble theirs">안녕하세요, 재고 있나요?</div>
          <div class="ld-bubble mine">네 있습니다! 사이즈 알려주세요</div>
          <div class="ld-bubble theirs">L사이즈 부탁드려요</div>
          <div class="ld-bubble mine">주문 넣어드리겠습니다!</div>
          <div class="ld-bubble theirs">네 알겠습니다!</div>
        </div>
        <div class="ld-cr-input"><div>메시지를 입력하세요...</div><span>▶</span></div>
      </div>
    </div>
  </div>

  <!-- Slide 4: Features -->
  <div class="slide" data-idx="3">
    <h2>핵심 기능 <span class="accent">4가지</span></h2>
    <div class="cards">
      <div class="card">
        <div class="card-icon">🎯</div>
        <h3>스마트 필터링</h3>
        <p>결제완료·배송완료 등 시스템 메시지 자동 숨김<br><span style="color:#22c55e;font-weight:700">답장이 필요한 채팅만</span> 기본 표시</p>
      </div>
      <div class="card">
        <div class="card-icon">🔍</div>
        <h3>채팅 검색</h3>
        <p>판매자 이름, UID, 채팅 내용으로<br>실시간 즉시 검색</p>
      </div>
      <div class="card">
        <div class="card-icon">⚡</div>
        <h3>바로 답장</h3>
        <p>채팅 클릭 → 입력창에 메시지 →<br><strong>Enter 한 번</strong>으로 즉시 전송</p>
      </div>
      <div class="card">
        <div class="card-icon">🔔</div>
        <h3>알림 시스템</h3>
        <p>판매자 메시지만 텔레그램+슬랙 알림<br>내 답장·시스템 메시지는 알림 안 감</p>
      </div>
    </div>
  </div>

  <!-- Slide 5: How to use -->
  <div class="slide" data-idx="4">
    <h2>일일 사용법</h2>
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-text">
          <h4>알림 확인</h4>
          <p>슬랙 또는 텔레그램에서 새 메시지 알림을 확인합니다</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-text">
          <h4>대시보드 접속</h4>
          <p>https://bunjang-monitor.pages.dev 에 접속합니다</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-text">
          <h4>채팅 확인</h4>
          <p><span style="color:#22c55e;font-weight:700">"답장 필요"</span> 초록 뱃지가 붙은 채팅을 클릭합니다</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">4</div>
        <div class="step-text">
          <h4>답장 전송</h4>
          <p>하단 입력창에 메시지를 입력하고 <strong>Enter</strong>를 누릅니다</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Slide 6: Alert rules -->
  <div class="slide" data-idx="5">
    <h2>알림은 이렇게 작동합니다</h2>
    <div class="rules">
      <div class="rule rule-yes">
        <span class="rule-icon">✅</span>
        <span>판매자가 보낸 <strong>실질적인 메시지</strong>만 알림</span>
      </div>
      <div class="rule rule-no">
        <span class="rule-icon">🔇</span>
        <span>내(veasly)가 보낸 답장 → 알림 안 감</span>
      </div>
      <div class="rule rule-no">
        <span class="rule-icon">🔇</span>
        <span>결제 완료, 배송 완료, 운송장 등록 → 알림 안 감</span>
      </div>
      <div class="rule rule-no">
        <span class="rule-icon">🔇</span>
        <span>거래 완료, 후기 도착, 구매확정 → 알림 안 감</span>
      </div>
    </div>
    <p style="margin-top:20px;font-size:14px;color:#64748b">※ 필터 키워드는 설정 탭 > 알림 필터에서 추가/수정할 수 있습니다</p>
  </div>

  <!-- Slide 7: FAQ -->
  <div class="slide" data-idx="6">
    <h2>자주 묻는 질문</h2>
    <div class="faqs">
      <div class="faq">
        <div class="faq-q">Q. 답장이 안 돼요</div>
        <div class="faq-a">상단에 "답장 ON" 뱃지가 표시되는지 확인하세요. "답장 OFF"이면 관리자에게 토큰 재등록을 요청하세요.</div>
      </div>
      <div class="faq">
        <div class="faq-q">Q. 채팅이 안 보여요</div>
        <div class="faq-a">좌측 상단 "폴링" 버튼을 눌러 수동으로 새로고침하세요. 그래도 안 되면 관리자에게 문의하세요.</div>
      </div>
      <div class="faq">
        <div class="faq-q">Q. 모바일에서도 사용 가능한가요?</div>
        <div class="faq-a">네. 모바일에서는 채팅 목록과 대화창이 전체 화면으로 전환됩니다. ← 버튼으로 뒤로 이동합니다.</div>
      </div>
      <div class="faq">
        <div class="faq-q">Q. 새 필터 키워드를 추가하고 싶어요</div>
        <div class="faq-a">설정 탭 > 알림 필터에서 키워드를 한 줄에 하나씩 입력 후 저장 버튼을 누르세요.</div>
      </div>
    </div>
  </div>

  <!-- Slide 8: Status -->
  <div class="slide" data-idx="7">
    <h2>시스템 현황</h2>
    <div class="status-grid">
      <div class="status-item">
        <div class="si-icon si-info">🌐</div>
        <div><div class="si-label">운영 URL</div><div class="si-value" style="font-size:13px;color:#f97316">bunjang-monitor.pages.dev</div></div>
      </div>
      <div class="status-item">
        <div class="si-icon si-info">👤</div>
        <div><div class="si-label">계정</div><div class="si-value">veasly (UID: 85142105)</div></div>
      </div>
      <div class="status-item">
        <div class="si-icon si-on">💬</div>
        <div><div class="si-label">추적 채팅</div><div class="si-value">30개</div></div>
      </div>
      <div class="status-item">
        <div class="si-icon si-on">📢</div>
        <div><div class="si-label">텔레그램</div><div class="si-value" style="color:#22c55e">ON</div></div>
      </div>
      <div class="status-item">
        <div class="si-icon si-on">💼</div>
        <div><div class="si-label">슬랙</div><div class="si-value" style="color:#22c55e">ON</div></div>
      </div>
      <div class="status-item">
        <div class="si-icon si-on">↩️</div>
        <div><div class="si-label">답장 기능</div><div class="si-value" style="color:#22c55e">ON</div></div>
      </div>
      <div class="status-item">
        <div class="si-icon si-warn">🔕</div>
        <div><div class="si-label">필터 키워드</div><div class="si-value">8개 활성</div></div>
      </div>
      <div class="status-item">
        <div class="si-icon si-warn">⏱️</div>
        <div><div class="si-label">자동 폴링</div><div class="si-value">3분 간격</div></div>
      </div>
    </div>
    <div class="warning">⚠️ 이 URL은 <strong>팀 내부 전용</strong>입니다. 외부에 절대 공유하지 마세요.</div>
  </div>

</div>

<!-- Navigation -->
<div class="nav">
  <button onclick="prev()">◀</button>
  <div class="dots" id="dots"></div>
  <div class="page-info" id="pageInfo">1 / 8</div>
  <button onclick="next()">▶</button>
</div>

<script>
let current = 0;
const total = 8;

function showSlide(n) {
  current = Math.max(0, Math.min(n, total - 1));
  document.querySelectorAll('.slide').forEach((s, i) => s.classList.toggle('active', i === current));
  document.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === current));
  document.getElementById('pageInfo').textContent = (current + 1) + ' / ' + total;
}
function next() { showSlide(current + 1); }
function prev() { showSlide(current - 1); }

// dots
const dotsEl = document.getElementById('dots');
for (let i = 0; i < total; i++) {
  const d = document.createElement('div');
  d.className = 'dot' + (i === 0 ? ' active' : '');
  d.onclick = () => showSlide(i);
  dotsEl.appendChild(d);
}

// keyboard
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === ' ') next();
  if (e.key === 'ArrowLeft') prev();
});

// swipe
let sx = 0;
document.addEventListener('touchstart', e => { sx = e.touches[0].clientX; });
document.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - sx;
  if (Math.abs(dx) > 50) dx > 0 ? prev() : next();
});
</script>
</body>
</html>
`;
