# 번개장터 채팅 모니터 - Cloud v4.0

## 프로젝트 개요
- **이름**: bunjang-monitor
- **목표**: 번개장터 채팅 메시지 실시간 모니터링 + 대시보드에서 바로 답장
- **핵심 기능**: 
  - 24시간 서버리스 채팅 알림 (텔레그램 + 슬랙)
  - 웹 대시보드에서 최근 채팅 목록 확인 및 인라인 답장
  - 판매자 닉네임 자동 조회 및 캐시
  - 시스템 키워드 자동 필터링

## URLs
- **프로덕션**: https://bunjang-monitor.pages.dev
- **API 상태**: https://bunjang-monitor.pages.dev/api/status

## 기술 스택
- **Backend**: Hono + TypeScript (Cloudflare Workers)
- **Storage**: Cloudflare KV (MONITOR_KV)
- **Frontend**: Tailwind CSS + Vanilla JS
- **로컬 모니터**: Python + Playwright

## 구현 완료 기능

### v4.0 (현재)
- **답장 기능**: 대시보드에서 채팅방 선택 → 인라인 답장 전송
- **BUN 토큰 등록**: 로컬 모니터에서 자동으로 번개장터 인증 토큰 추출 & 클라우드 등록
- **탭 기반 대시보드**: 채팅 & 답장 / 설정 / 로그 탭 분리
- **최근 채팅 목록**: 시간순 정렬, 닉네임 표시, 상대 시간 (방금, n분 전)

### v3.0
- **메시지 누락 버그 수정**: 1분 내 복수 메시지 모두 감지
- **슬랙 Webhook 연동**: 텔레그램 + 슬랙 동시 알림
- **필터링 강화**: 시스템 메시지 무시 (결제 완료, 배송, 구매확정 등)

### v2.x
- Firebase Firestore REST 폴링
- 텔레그램 알림
- 닉네임 자동 조회
- 로컬 모니터 (Playwright 자동 로그인)

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/status` | 시스템 상태 조회 |
| GET | `/api/recent-chats` | 최근 채팅 목록 (답장 UI용) |
| POST | `/api/reply` | 채팅 답장 전송 |
| POST | `/api/bun-token` | BUN 인증 토큰 등록 |
| POST | `/api/token` | Firebase 토큰 등록 |
| GET/POST | `/api/cron` / `/api/trigger` | 수동 폴링 실행 |
| GET | `/api/config` | 설정 조회 |
| POST | `/api/config` | 설정 저장 |
| POST | `/api/test-notify` | 테스트 알림 전송 |
| GET | `/api/logs` | 모니터링 로그 |
| GET | `/api/nicknames` | 닉네임 캐시 |
| POST | `/api/reset` | 상태 초기화 |

### POST /api/reply 파라미터
```json
{
  "channel_id": "84128013_85142105",
  "target_uid": "84128013",
  "message": "안녕하세요, 확인했습니다!"
}
```

## 답장 기능 사용법

1. **로컬 모니터 설정**: `config.py`에서 `CLOUD_API_URL`을 `https://bunjang-monitor.pages.dev`로 설정
2. **start.bat 실행**: Playwright가 번개장터 로그인 → 토큰 추출 → 클라우드 자동 등록
3. **대시보드 접속**: https://bunjang-monitor.pages.dev → "채팅 & 답장" 탭
4. **답장 보내기**: 채팅방 옆 "답장" 버튼 클릭 → 메시지 입력 → Enter or 전송 버튼

## 데이터 구조
- **config**: Firebase/Telegram/Slack/BUN 토큰, 필터 키워드
- **chat_state**: 채널별 마지막 메시지, 타임스탬프, 상대방 ID
- **nickname_cache**: UID → 닉네임 매핑
- **logs**: 최근 200건 이벤트 로그

## 알림 흐름
```
번개장터 새 메시지 → Firestore 변경 감지
  → Cloudflare Worker (매 분 폴링)
    → 텔레그램 알림 전송
    → 슬랙 알림 전송
  → 대시보드 실시간 반영
    → "답장" 클릭 → Bunjang Talk API로 전송
```

## 배포
- **플랫폼**: Cloudflare Pages
- **상태**: Active
- **마지막 업데이트**: 2026-03-30
