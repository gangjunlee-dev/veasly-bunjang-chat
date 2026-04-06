"""
번개장터 채팅 모니터 v2.4
==========================
자동 로그인 + Firebase Firestore 실시간 채팅 알림

크롬 확장 프로그램의 자동 로그인 방식을 Playwright로 이식:
  m.bunjang.co.kr/signup → 본인인증 자동 입력 → 로그인
  → Firebase Auth 토큰 추출 → Firestore REST 폴링 → 알림

사용법:
  python monitor.py              # 일반 실행 (저장된 세션 사용)
  python monitor.py --login      # 강제 재로그인
  python monitor.py --test       # 알림 테스트
"""

import asyncio
import argparse
import json
import logging
import os
import sys
import time
import traceback
import urllib.request
import urllib.parse
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import (
    FIREBASE_CONFIG,
    POLL_INTERVAL,
    TOKEN_REFRESH_INTERVAL,
    SESSION_DIR,
    FIREBASE_TOKEN_FILE,
    SIGNUP_DATA,
    IGNORE_KEYWORDS,
    CLOUD_API_URL,
)
from notifier import NotificationManager

# ============================================
# 로깅 - 파일 + 콘솔 동시 출력
# ============================================
os.makedirs(SESSION_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(
            os.path.join(SESSION_DIR, "monitor.log"),
            encoding="utf-8",
            mode="a",
        ),
    ],
)
logger = logging.getLogger("monitor")

# ============================================
# 상수
# ============================================
BUNJANG_SIGNUP_URL = "https://m.bunjang.co.kr/signup?rd_url=%2F"
BUNJANG_TALK_URL = "https://m.bunjang.co.kr/talk2"
BUNJANG_MAIN_URL = "https://m.bunjang.co.kr"

FIRESTORE_BASE = (
    f"https://firestore.googleapis.com/v1/projects/"
    f"{FIREBASE_CONFIG['projectId']}/databases/(default)/documents"
)


# ============================================
# Firebase 토큰 관리
# ============================================

def save_token(token_data: dict):
    os.makedirs(SESSION_DIR, exist_ok=True)
    token_data["saved_at"] = datetime.now().isoformat()
    with open(FIREBASE_TOKEN_FILE, "w", encoding="utf-8") as f:
        json.dump(token_data, f, indent=2, ensure_ascii=False)
    logger.info("[SAVE] Token saved")


def load_token() -> dict | None:
    if not os.path.exists(FIREBASE_TOKEN_FILE):
        return None
    try:
        with open(FIREBASE_TOKEN_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        logger.info(f"[LOAD] Token loaded - UID: {data.get('uid', '?')}")
        return data
    except Exception as e:
        logger.warning(f"[WARN] Token load failed: {e}")
        return None


def refresh_id_token(refresh_token: str) -> dict | None:
    try:
        url = f"https://securetoken.googleapis.com/v1/token?key={FIREBASE_CONFIG['apiKey']}"
        data = urllib.parse.urlencode({
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        }).encode("utf-8")
        req = urllib.request.Request(url, data=data)
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())
            return {
                "id_token": result["id_token"],
                "refresh_token": result["refresh_token"],
                "uid": result["user_id"],
                "expires_in": int(result["expires_in"]),
            }
    except Exception as e:
        logger.error(f"[ERROR] Token refresh failed: {e}")
        return None


# ============================================
# Firebase 토큰 추출 JS (재사용)
# ============================================

EXTRACT_TOKEN_JS = """
async () => {
    const result = {
        source: null, uid: null, id_token: null, refresh_token: null,
        email: null, display_name: null, photo_url: null,
        bun_auth_token: null, talk_id_token: null,
    };
    
    // IndexedDB - Firebase Token
    try {
        const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open('firebaseLocalStorageDb');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        const tx = db.transaction('firebaseLocalStorage', 'readonly');
        const store = tx.objectStore('firebaseLocalStorage');
        const items = await new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        for (const item of items) {
            const val = item.value || item;
            if (val && val.uid) {
                result.source = 'indexeddb';
                result.uid = val.uid;
                result.email = val.email || null;
                result.display_name = val.displayName || null;
                result.photo_url = val.photoURL || null;
                if (val.stsTokenManager) {
                    result.id_token = val.stsTokenManager.accessToken || null;
                    result.refresh_token = val.stsTokenManager.refreshToken || null;
                }
                break;
            }
        }
        db.close();
    } catch (e) {}
    
    // localStorage fallback for Firebase
    if (!result.uid) {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.toLowerCase().includes('firebase')) {
                    try {
                        const val = JSON.parse(localStorage.getItem(key));
                        if (val && val.uid) {
                            result.source = 'localStorage';
                            result.uid = val.uid;
                            result.email = val.email || null;
                            result.display_name = val.displayName || null;
                            if (val.stsTokenManager) {
                                result.id_token = val.stsTokenManager.accessToken || null;
                                result.refresh_token = val.stsTokenManager.refreshToken || null;
                            }
                            break;
                        }
                    } catch (e) {}
                }
            }
        } catch (e) {}
    }
    
    // X-BUN-AUTH-TOKEN 추출: sessionStorage/localStorage에서 직접 추출
    try {
        // 방법 1: sessionStorage에서 accessToken 확인
        const ssToken = sessionStorage.getItem('accessToken') || sessionStorage.getItem('authToken');
        if (ssToken) result.bun_auth_token = ssToken;
        
        // 방법 2: localStorage에서 확인
        if (!result.bun_auth_token) {
            const lsToken = localStorage.getItem('accessToken') || localStorage.getItem('authToken');
            if (lsToken) result.bun_auth_token = lsToken;
        }
        
        // 방법 3: 쿠키에서 추출
        if (!result.bun_auth_token) {
            const cookies = document.cookie.split(';');
            for (const c of cookies) {
                const [name, ...val] = c.trim().split('=');
                if (name === 'access_token' || name === 'auth_token' || name === 'bun_token') {
                    result.bun_auth_token = val.join('=');
                    break;
                }
            }
        }
    } catch (e) {}
    
    // 방법 4: Session Login API 호출 (Firebase ID Token으로)
    if (!result.bun_auth_token && result.id_token) {
        try {
            const loginResp = await fetch('https://api.bunjang.co.kr/api/session/v1/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-BUN-AUTH-TOKEN': result.id_token },
                body: '{}',
                credentials: 'include',
            });
            const loginData = await loginResp.json();
            if (loginData?.data?.token) {
                result.bun_auth_token = loginData.data.token;
            }
            
            // Session에서 토큰 가져오기 (fallback)
            if (!result.bun_auth_token) {
                const sessResp = await fetch('https://api.bunjang.co.kr/api/session/v1/session', {
                    credentials: 'include',
                });
                const sessData = await sessResp.json();
                if (sessData?.data?.token) {
                    result.bun_auth_token = sessData.data.token;
                }
            }
        } catch (e) {}
    }
    
    // Talk ID Token 발급 (BUN Auth Token이 있으면)
    if (result.bun_auth_token) {
        try {
            const talkResp = await fetch('https://api.bunjang.co.kr/api/talk/v3/auth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-BUN-AUTH-TOKEN': result.bun_auth_token,
                },
                body: JSON.stringify({ region: 'SEOUL' }),
            });
            const talkData = await talkResp.json();
            if (talkData?.data?.idToken) {
                result.talk_id_token = talkData.data.idToken;
            }
        } catch (e) {}
    }
    
    // 방법 5: Fetch API intercept - 네트워크 요청에서 토큰 캡처 시도
    // (이미 위에서 찾았으면 스킵)
    
    return result;
}
"""


# ============================================
# 클라우드 자동 등록
# ============================================

def register_to_cloud(token_data: dict):
    """추출한 토큰을 Cloud Edition에 자동 등록"""
    if not CLOUD_API_URL:
        return
    
    url = CLOUD_API_URL.rstrip("/")
    
    common_headers = {
        "Content-Type": "application/json",
        "User-Agent": "BunjangMonitor/4.0",
        "Accept": "application/json",
        "Origin": url,
    }
    
    # 1. Firebase 토큰 등록
    try:
        payload = json.dumps({
            "uid": token_data.get("uid", ""),
            "id_token": token_data.get("id_token", ""),
            "refresh_token": token_data.get("refresh_token", ""),
        }).encode("utf-8")
        req = urllib.request.Request(f"{url}/api/token", data=payload)
        for k, v in common_headers.items():
            req.add_header(k, v)
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())
            if result.get("ok"):
                logger.info(f"[CLOUD] Firebase token registered to cloud")
            else:
                logger.warning(f"[CLOUD] Firebase token registration failed: {result}")
    except Exception as e:
        logger.warning(f"[CLOUD] Firebase token registration error: {e}")
    
    # 2. BUN Auth Token + Talk ID Token 등록
    bun_token = token_data.get("bun_auth_token", "")
    talk_token = token_data.get("talk_id_token", "")
    
    if bun_token or talk_token:
        try:
            payload = json.dumps({
                "bun_auth_token": bun_token,
                "talk_id_token": talk_token,
            }).encode("utf-8")
            req = urllib.request.Request(f"{url}/api/bun-token", data=payload)
            for k, v in common_headers.items():
                req.add_header(k, v)
            with urllib.request.urlopen(req, timeout=15) as resp:
                result = json.loads(resp.read())
                if result.get("ok"):
                    logger.info(f"[CLOUD] BUN tokens registered - Reply function ENABLED!")
                else:
                    logger.warning(f"[CLOUD] BUN token registration failed: {result}")
        except Exception as e:
            logger.warning(f"[CLOUD] BUN token registration error: {e}")
    else:
        logger.info("[CLOUD] No BUN tokens to register (reply function won't be available)")


# ============================================
# Playwright 자동 로그인
# ============================================

async def auto_login_and_extract_token(force_login: bool = False) -> dict | None:
    """
    크롬 확장 프로그램의 자동 로그인 플로우를 Playwright로 구현.
    
    핵심 변경: 브라우저를 닫지 않고 토큰만 추출.
    로그인+토큰 추출 완료 후에만 브라우저 종료.
    """
    from playwright.async_api import async_playwright

    base_dir = os.path.dirname(os.path.abspath(__file__))
    session_path = os.path.join(base_dir, SESSION_DIR, "browser_profile")
    os.makedirs(session_path, exist_ok=True)

    logger.info("=" * 55)
    logger.info("  BUNJANG CHAT MONITOR v2.4 - AUTO LOGIN")
    logger.info("=" * 55)

    pw = await async_playwright().start()
    context = None
    
    try:
        context = await pw.chromium.launch_persistent_context(
            user_data_dir=session_path,
            headless=False,
            viewport={"width": 1280, "height": 900},
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-web-security",
            ],
            ignore_default_args=["--enable-automation"],
        )
        logger.info("[OK] Browser launched")
    except Exception as e:
        logger.error(f"[ERROR] Browser launch failed: {e}")
        logger.error("  Make sure Playwright browsers are installed:")
        logger.error("  Run: python -m playwright install chromium")
        traceback.print_exc()
        await pw.stop()
        return None

    page = context.pages[0] if context.pages else await context.new_page()

    # 자동화 탐지 우회
    await page.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
        window.chrome = { runtime: {} };
    """)

    try:
        # ── STEP 0: 이미 로그인 돼있는지 확인 ──
        if not force_login:
            logger.info("[0/6] Checking existing session...")
            try:
                await page.goto(BUNJANG_TALK_URL, wait_until="domcontentloaded", timeout=30000)
                await asyncio.sleep(3)
                cur = page.url
                logger.info(f"  URL: {cur}")
                if not any(kw in cur.lower() for kw in ["login", "auth", "signup"]):
                    logger.info("  [OK] Already logged in!")
                    token = await _try_extract_token(page)
                    if token:
                        logger.info("[DONE] Token extracted from existing session")
                        await context.close()
                        await pw.stop()
                        return token
                    logger.info("  Token not found yet, will try after talk page loads...")
            except Exception as e:
                logger.warning(f"  Session check failed: {e}")

        # ── STEP 1: 회원가입/본인인증 페이지로 이동 ──
        logger.info("[1/6] Opening signup page...")
        try:
            await page.goto(BUNJANG_SIGNUP_URL, wait_until="domcontentloaded", timeout=30000)
        except Exception as e:
            logger.error(f"  Page load failed: {e}")
            logger.info("  Retrying...")
            await asyncio.sleep(2)
            await page.goto(BUNJANG_SIGNUP_URL, wait_until="domcontentloaded", timeout=60000)
        
        await asyncio.sleep(3)
        logger.info(f"  URL: {page.url}")

        # ── STEP 2: 폼 자동 입력 ──
        logger.info("[2/6] Auto-filling form...")
        
        # 이름
        filled_ok = await _safe_fill(page,
            "/html/body/div[1]/div/div/div[1]/div/div[1]/form/div[1]/div[1]/label/input",
            SIGNUP_DATA["name"], "Name")
        
        if not filled_ok:
            logger.warning("  Form not found - page might be different.")
            logger.info("  Trying CSS selector fallback...")
            # CSS 셀렉터 폴백
            filled_ok = await _safe_fill_css(page, 'input[name="name"], input[placeholder*="이름"]',
                SIGNUP_DATA["name"], "Name (CSS)")
        
        # 생년월일 앞자리
        await _safe_fill(page,
            "/html/body/div[1]/div/div/div[1]/div/div[1]/form/div[1]/div[2]/div/div[1]/label/input",
            SIGNUP_DATA["birth_front"], "Birth front")
        
        # 생년월일 뒷자리
        await _safe_fill(page,
            "/html/body/div[1]/div/div/div[1]/div/div[1]/form/div[1]/div[2]/div/div[3]/label/input",
            SIGNUP_DATA["birth_back"], "Birth back")
        
        # 전화번호
        await _safe_fill(page,
            "/html/body/div[1]/div/div/div[1]/div/div[1]/form/div[1]/div[3]/label/input",
            SIGNUP_DATA["phone"], "Phone")
        
        # 통신사
        await _safe_select(page,
            "/html/body/div[1]/div/div/div[1]/div/div[1]/form/div[1]/div[4]/label/select",
            SIGNUP_DATA["carrier"], "Carrier")

        await asyncio.sleep(0.5)

        # ── STEP 3: 전체 동의 → 다음 → 제출 ──
        logger.info("[3/6] Clicking buttons...")
        
        # 전체 동의
        await _safe_click(page,
            "/html/body/div[1]/div/div/div[1]/div/div[1]/form/div[2]/button",
            "Agree all")
        
        # 다음
        await _safe_click(page,
            "/html/body/div[1]/div/div/div[1]/div/div[1]/form/button",
            "Next")
        
        await asyncio.sleep(1)
        
        # 제출
        await _safe_click(page,
            "/html/body/div[1]/div/div/div[1]/div/div[1]/form/button",
            "Submit")

        # ── STEP 4: 인증번호 ──
        logger.info("[4/6] Verification code...")
        
        vcode = SIGNUP_DATA.get("verification_code", "")
        if vcode:
            logger.info(f"  Auto-entering code from config...")
            await asyncio.sleep(2)
            await _safe_fill(page,
                "/html/body/div[1]/div/div/div[1]/div/div[2]/div/form/label/input",
                vcode, "Verification code")
            await _safe_click(page,
                "/html/body/div[1]/div/div/div[1]/div/div[2]/div/form/button",
                "Complete")
        else:
            logger.info("")
            logger.info("  *** SMS VERIFICATION CODE REQUIRED ***")
            logger.info("  Enter the code in the browser window.")
            logger.info("  Waiting up to 3 minutes...")
            logger.info("")

        # ── STEP 5: 로그인 완료 대기 ──
        logger.info("[5/6] Waiting for login...")
        
        # 최대 5분 대기 (인증번호 수동 입력 포함)
        login_ok = await _wait_for_login(page, timeout=300)
        
        if not login_ok:
            logger.error("[FAIL] Login did not complete in time.")
            logger.info("  The browser window will stay open.")
            logger.info("  Please log in manually, then press Enter here...")
            
            # 브라우저 열어둔 채로 Enter 대기
            await asyncio.get_event_loop().run_in_executor(None, input, "  Press Enter after logging in: ")
            
            # talk 페이지로 이동
            await page.goto(BUNJANG_TALK_URL, wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(3)

        # talk 페이지로 이동
        cur = page.url
        if "talk" not in cur.lower():
            logger.info("  Navigating to Talk page...")
            await page.goto(BUNJANG_TALK_URL, wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(5)

        # ── STEP 6: 토큰 추출 ──
        logger.info("[6/6] Extracting Firebase token...")
        token = await _try_extract_token(page)
        
        if not token:
            # 한번 더 시도 - networkidle 대기
            logger.info("  Retrying with full page load...")
            await page.goto(BUNJANG_TALK_URL, wait_until="networkidle", timeout=60000)
            await asyncio.sleep(5)
            token = await _try_extract_token(page)

        if token:
            logger.info("[DONE] Login + token extraction complete!")
        else:
            logger.error("[FAIL] Could not extract Firebase token")
            logger.info("  Check if you can see chats on m.bunjang.co.kr/talk2")

        # 브라우저 종료
        await context.close()
        await pw.stop()
        return token

    except Exception as e:
        logger.error(f"[ERROR] {e}")
        traceback.print_exc()
        try:
            if context:
                await context.close()
            await pw.stop()
        except:
            pass
        return None


async def _safe_fill(page, xpath: str, value: str, label: str) -> bool:
    """XPath로 input 찾아서 React 호환 방식으로 값 입력"""
    try:
        el = page.locator(f"xpath={xpath}")
        await el.wait_for(state="visible", timeout=5000)
        
        # React 앱 호환: nativeInputValueSetter 사용
        await el.evaluate("""
            (el, val) => {
                const setter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'value'
                ).set;
                setter.call(el, val);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        """, value)
        
        logger.info(f"  [OK] {label}")
        await asyncio.sleep(0.3)
        return True
    except Exception as e:
        logger.warning(f"  [SKIP] {label}: {e}")
        return False


async def _safe_fill_css(page, css: str, value: str, label: str) -> bool:
    """CSS 셀렉터로 input 값 입력 (폴백)"""
    try:
        el = page.locator(css).first
        await el.wait_for(state="visible", timeout=5000)
        await el.fill(value)
        logger.info(f"  [OK] {label}")
        await asyncio.sleep(0.3)
        return True
    except Exception as e:
        logger.warning(f"  [SKIP] {label}: {e}")
        return False


async def _safe_select(page, xpath: str, value: str, label: str) -> bool:
    """XPath로 select 요소 값 선택"""
    try:
        el = page.locator(f"xpath={xpath}")
        await el.wait_for(state="visible", timeout=5000)
        await el.select_option(value=value)
        logger.info(f"  [OK] {label}")
        await asyncio.sleep(0.3)
        return True
    except Exception as e:
        logger.warning(f"  [SKIP] {label}: {e}")
        return False


async def _safe_click(page, xpath: str, label: str) -> bool:
    """XPath로 버튼 클릭"""
    try:
        el = page.locator(f"xpath={xpath}")
        await el.wait_for(state="visible", timeout=5000)
        await el.click()
        logger.info(f"  [OK] {label}")
        await asyncio.sleep(0.5)
        return True
    except Exception as e:
        logger.warning(f"  [SKIP] {label}: {e}")
        return False


async def _wait_for_login(page, timeout: int = 300) -> bool:
    """로그인 완료 대기 - URL이 login/signup/auth가 아닌 페이지로 이동할 때까지"""
    start = time.time()
    while time.time() - start < timeout:
        await asyncio.sleep(2)
        try:
            cur = page.url
            # 로그인/인증 페이지가 아니면 성공
            if not any(kw in cur.lower() for kw in ["login", "auth", "signup", "accounts.kakao", "nid.naver"]):
                logger.info(f"  [OK] Login detected! URL: {cur}")
                return True
        except:
            pass
        
        elapsed = int(time.time() - start)
        if elapsed % 30 == 0 and elapsed > 0:
            logger.info(f"  ... waiting ({elapsed}s / {timeout}s)")
    
    return False


async def _try_extract_token(page) -> dict | None:
    """페이지에서 Firebase 토큰 + 번개장터 인증 토큰 추출 시도"""
    try:
        await asyncio.sleep(2)
        token_data = await page.evaluate(EXTRACT_TOKEN_JS)
        
        if token_data and token_data.get("uid"):
            logger.info(f"  [OK] Token found!")
            logger.info(f"  Source: {token_data.get('source')}")
            logger.info(f"  UID: {token_data['uid']}")
            logger.info(f"  Name: {token_data.get('display_name', 'N/A')}")
            logger.info(f"  ID Token: {'Yes' if token_data.get('id_token') else 'No'}")
            logger.info(f"  Refresh Token: {'Yes' if token_data.get('refresh_token') else 'No'}")
            logger.info(f"  BUN Auth Token: {'Yes' if token_data.get('bun_auth_token') else 'No'}")
            logger.info(f"  Talk ID Token: {'Yes' if token_data.get('talk_id_token') else 'No'}")
            
            if token_data.get('bun_auth_token'):
                logger.info("  [OK] Reply function ENABLED - BUN tokens extracted!")
            else:
                logger.warning("  [WARN] Reply function DISABLED - BUN tokens not found")
                logger.info("  (Chat monitoring still works, but reply feature won't be available)")
            
            save_token(token_data)
            
            # 클라우드에 자동 등록
            register_to_cloud(token_data)
            
            return token_data
        return None
    except Exception as e:
        logger.warning(f"  Token extraction error: {e}")
        return None


# ============================================
# Firestore REST API 폴링
# ============================================

def parse_firestore_value(val: dict):
    if "stringValue" in val:
        return val["stringValue"]
    if "integerValue" in val:
        return int(val["integerValue"])
    if "booleanValue" in val:
        return val["booleanValue"]
    if "timestampValue" in val:
        return val["timestampValue"]
    if "mapValue" in val:
        fields = val["mapValue"].get("fields", {})
        return {k: parse_firestore_value(v) for k, v in fields.items()}
    if "arrayValue" in val:
        values = val["arrayValue"].get("values", [])
        return [parse_firestore_value(v) for v in values]
    if "nullValue" in val:
        return None
    return str(val)


def fetch_chat_channels(uid: str, id_token: str) -> list:
    url = f"{FIRESTORE_BASE}/users/{uid}/channels?orderBy=last_messaged_at%20desc&pageSize=20"
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {id_token}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            documents = data.get("documents", [])
            channels = []
            for doc in documents:
                fields = doc.get("fields", {})
                channel = {
                    "doc_path": doc.get("name", ""),
                    "channel_id": doc.get("name", "").split("/")[-1],
                }
                for key, val in fields.items():
                    channel[key] = parse_firestore_value(val)
                channels.append(channel)
            return channels
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            logger.warning("[WARN] Token expired")
            raise
        logger.error(f"[ERROR] Firestore error: {e.code}")
        return []
    except Exception as e:
        logger.error(f"[ERROR] Fetch failed: {e}")
        return []


# 닉네임 캐시 (other_id -> nickname)
_nickname_cache = {}


def fetch_user_nickname(other_id, id_token: str) -> str:
    """상대방 닉네임 조회 - 번개장터 상점 프로필 API 사용"""
    other_id = str(other_id)
    
    if other_id in _nickname_cache:
        return _nickname_cache[other_id]
    
    # 번개장터 상점 프로필 API (인증 불필요, 공개 API)
    try:
        url = f"https://api.bunjang.co.kr/api/1/shop/{other_id}/cached_profile.json"
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        req.add_header("Referer", "https://m.bunjang.co.kr/")
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            user_info = data.get("user_info", {})
            basic = user_info.get("basic", {})
            user_name = basic.get("user_name", "")
            if user_name:
                _nickname_cache[other_id] = user_name
                logger.info(f"[NICK] {other_id} -> {user_name}")
                return user_name
    except Exception as e:
        logger.info(f"[NICK] Profile lookup failed for {other_id}: {e}")

    # 실패 → ID 그대로
    _nickname_cache[other_id] = other_id
    return other_id


async def polling_monitor(token_data: dict, notifier: NotificationManager):
    uid = token_data["uid"]
    id_token = token_data.get("id_token", "")
    refresh_token = token_data.get("refresh_token", "")

    logger.info("")
    logger.info("=" * 55)
    logger.info("  CHAT MONITOR RUNNING")
    logger.info(f"  UID: {uid}")
    logger.info(f"  Poll interval: {POLL_INTERVAL}s")
    logger.info("  Press Ctrl+C to stop")
    logger.info("=" * 55)
    logger.info("")

    known = {}
    last_refresh = time.time()
    polls = 0
    errors = 0

    # 초기 스냅샷
    try:
        initial = fetch_chat_channels(uid, id_token)
        for ch in initial:
            cid = ch.get("channel_id", "")
            known[cid] = {
                "last_message_content": ch.get("last_message_content", ""),
                "last_messaged_at": ch.get("last_messaged_at", ""),
            }
        logger.info(f"[INIT] {len(known)} existing chats loaded")
        # 첫 번째 채팅방의 전체 필드 출력 (디버그용)
        if initial:
            logger.info(f"[DEBUG] First channel fields: {list(initial[0].keys())}")
            logger.info(f"[DEBUG] First channel data: {json.dumps(initial[0], default=str, ensure_ascii=False)[:500]}")
        for ch in initial[:5]:
            other = ch.get("other_id", ch.get("channel_id", "?"))
            nickname = fetch_user_nickname(other, id_token)
            msg = str(ch.get("last_message_content", ""))[:40]
            logger.info(f"  - {nickname}: {msg}")
    except Exception as e:
        logger.warning(f"[WARN] Initial load failed: {e}")

    # 메인 루프
    while True:
        try:
            await asyncio.sleep(POLL_INTERVAL)
            polls += 1

            # 토큰 갱신
            if time.time() - last_refresh > TOKEN_REFRESH_INTERVAL:
                logger.info("[REFRESH] Refreshing token...")
                new = refresh_id_token(refresh_token)
                if new:
                    id_token = new["id_token"]
                    refresh_token = new["refresh_token"]
                    token_data.update(new)
                    save_token(token_data)
                    last_refresh = time.time()
                    logger.info("[REFRESH] OK")

            # 채널 조회
            try:
                channels = fetch_chat_channels(uid, id_token)
            except urllib.error.HTTPError as e:
                if e.code in (401, 403):
                    new = refresh_id_token(refresh_token)
                    if new:
                        id_token = new["id_token"]
                        refresh_token = new["refresh_token"]
                        token_data.update(new)
                        save_token(token_data)
                        last_refresh = time.time()
                        channels = fetch_chat_channels(uid, id_token)
                    else:
                        errors += 1
                        continue
                else:
                    raise

            # 변경 감지
            for ch in channels:
                cid = ch.get("channel_id", "")
                msg = str(ch.get("last_message_content", ""))
                ts = ch.get("last_messaged_at", "")
                other = ch.get("other_id", "?")
                prev = known.get(cid)

                # 필터링: IGNORE_KEYWORDS에 포함된 메시지는 무시
                if any(kw in msg for kw in IGNORE_KEYWORDS):
                    known[cid] = {"last_message_content": msg, "last_messaged_at": ts}
                    continue

                if prev is None:
                    nickname = fetch_user_nickname(other, id_token)
                    logger.info(f"[NEW CHAT] {nickname}: {msg}")
                    notifier.send("New Chat", msg[:200] or "(new)", nickname)
                    known[cid] = {"last_message_content": msg, "last_messaged_at": ts}
                elif prev["last_messaged_at"] != ts or prev["last_message_content"] != msg:
                    nickname = fetch_user_nickname(other, id_token)
                    logger.info(f"[NEW MSG] {nickname}: {msg}")
                    notifier.send("New Message", msg[:200] or "(updated)", nickname)
                    known[cid] = {"last_message_content": msg, "last_messaged_at": ts}

            errors = 0
            if polls % 100 == 0:
                logger.info(f"[STATUS] Poll #{polls} | Chats: {len(known)}")

        except KeyboardInterrupt:
            logger.info("\n[STOP] Stopped by user")
            break
        except Exception as e:
            errors += 1
            logger.error(f"[ERROR] ({errors}): {e}")
            if errors > 10:
                logger.error("[FATAL] Too many errors")
                break
            await asyncio.sleep(min(errors * 5, 30))


# ============================================
# 메인
# ============================================

async def main():
    parser = argparse.ArgumentParser(description="Bunjang Chat Monitor v2.4")
    parser.add_argument("--login", action="store_true", help="Force re-login")
    parser.add_argument("--test", action="store_true", help="Test notifications")
    args = parser.parse_args()

    print()
    print("=" * 55)
    print("  Bunjang Chat Monitor v2.4 - Auto Login")
    print("  m.bunjang.co.kr + Firebase Firestore")
    print("=" * 55)
    print()

    notifier = NotificationManager()

    if args.test:
        notifier.test()
        return

    token_data = None
    if not args.login:
        token_data = load_token()
        if token_data:
            refresh = token_data.get("refresh_token")
            if refresh:
                logger.info("[CHECK] Verifying saved token...")
                new = refresh_id_token(refresh)
                if new:
                    token_data.update(new)
                    save_token(token_data)
                    logger.info("[OK] Token valid!")
                    # 클라우드에 자동 등록 (저장된 토큰으로)
                    register_to_cloud(token_data)
                else:
                    logger.warning("[WARN] Token expired")
                    token_data = None
            else:
                token_data = None

    if not token_data:
        token_data = await auto_login_and_extract_token(force_login=args.login)
        if not token_data:
            logger.error("[FAIL] Login failed.")
            logger.error("  Try: python monitor.py --login")
            return

    await polling_monitor(token_data, notifier)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[EXIT] Goodbye!")
    except Exception as e:
        print(f"\n[FATAL ERROR] {e}")
        traceback.print_exc()
        print("\nCheck session_data/monitor.log for details.")
        input("Press Enter to exit...")
