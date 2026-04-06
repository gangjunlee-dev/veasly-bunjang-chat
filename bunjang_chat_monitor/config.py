"""
번개장터 채팅 모니터 - 설정 파일
==================================
이 파일에서 알림 설정을 변경하세요.
"""

# ============================================
# 텔레그램 알림 설정 (선택사항)
# ============================================
# 1. @BotFather 에게 /newbot 으로 봇 생성
# 2. 받은 토큰을 아래에 입력
# 3. @userinfobot 에게 메시지 보내서 Chat ID 확인
# 4. 아래에 Chat ID 입력
TELEGRAM_BOT_TOKEN = ""   # 예: "7012345678:AAHxyz..."
TELEGRAM_CHAT_ID = ""      # 예: "123456789"

# ============================================
# 번개장터 Firebase 설정 (변경 불필요)
# ============================================
FIREBASE_CONFIG = {
    "apiKey": "AIzaSyAyQ8EtBrYnr5Oenj3Rl4-axLtb7uszHdA",
    "authDomain": "bun-talk2-seoul-prod.firebaseapp.com",
    "databaseURL": "https://bun-talk2-seoul-prod.firebaseio.com",
    "projectId": "bun-talk2-seoul-prod",
}

# ============================================
# 모니터링 설정
# ============================================
# 폴링 간격 (초) - REST API 폴링 모드에서 사용
POLL_INTERVAL = 3

# 토큰 갱신 간격 (초) - Firebase ID 토큰 유효기간 1시간
TOKEN_REFRESH_INTERVAL = 50 * 60  # 50분

# 세션 저장 경로
SESSION_DIR = "session_data"

# Firebase 토큰 저장 파일
FIREBASE_TOKEN_FILE = "session_data/firebase_token.json"

# ============================================
# 자동 로그인 데이터 (크롬 확장 프로그램 데이터)
# ============================================
# 번개장터 본인인증 자동 입력 정보
# 크롬 확장 content.js에서 가져온 값
SIGNUP_DATA = {
    "name": "김번장",                # 이름
    "birth_front": "710819",         # 생년월일 앞자리 (YYMMDD)
    "birth_back": "2",               # 생년월일 뒷자리 (성별)
    "phone": "01410051898",          # 전화번호
    "carrier": "LGT",               # 통신사 (SKT, KT, LGT, SKT_MVNO, KT_MVNO, LGT_MVNO)
    "verification_code": "458850",    # 고정 인증번호
}

# ============================================
# 메시지 필터링 (알림 제외할 키워드)
# ============================================
# 아래 키워드가 포함된 메시지는 알림을 보내지 않습니다.
# 필요시 추가/삭제 가능
IGNORE_KEYWORDS = [
    "결제가 완료되었어요",
    "상품 준비중",
]

# ============================================
# 알림 메시지 형식
# ============================================
NOTIFICATION_TITLE = "번개장터 새 메시지"

# ============================================
# 클라우드 모니터 연동 (Cloud Edition)
# ============================================
# 로컬에서 추출한 토큰을 Cloud Edition에 자동 등록
# Cloud Dashboard URL을 입력하면 start.bat 실행 시 자동 등록됩니다.
CLOUD_API_URL = "https://bunjang-monitor.pages.dev"
