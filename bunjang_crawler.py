"""
번개장터 주문 수집기 v8.0 — 공식 Open API 사용
================================================

v7.x 크롤러 → v8.0 공식 API:
  - Playwright 브라우저 불필요! (순수 Python HTTP)
  - JWT 인증 (accessKey + secretKey)
  - 안정적 + CORS/세션/필터 문제 없음
  - 배송정보(택배사, 송장번호) 완벽 추출

API 엔드포인트:
  - GET /api/v1/orders           — 주문 목록 (최대 15일 구간)
  - GET /api/v1/orders/{orderId} — 주문 상세 (배송정보 포함)

사용법:
  python bunjang_crawler.py --test 10           # 최근 15일, 10건 테스트
  python bunjang_crawler.py --test 10 --debug   # 디버그 포함
  python bunjang_crawler.py                     # 최근 15일 전체
  python bunjang_crawler.py --days 30           # 최근 30일 (15일씩 분할)
  python bunjang_crawler.py --days 90           # 최근 90일
  python bunjang_crawler.py --start 2025-01-01 --end 2025-03-31  # 기간 지정

옵션:
  --test N            상위 N건만 수집 (빠른 테스트)
  --days N            최근 N일 수집 (기본 15일, 15일씩 분할 호출)
  --start YYYY-MM-DD  시작일 지정
  --end YYYY-MM-DD    종료일 지정
  --output 파일.csv   출력 파일명 (기본: bunjang_orders.csv)
  --size N            페이지당 건수 (기본 100, 최대 100)
  --no-detail         상세 조회 건너뛰기 (목록만)
  --debug             디버그 모드

필요 패키지:
  pip install httpx pandas PyJWT
"""

import asyncio
import argparse
import json
import sys
import time
import uuid
import base64
import hashlib
import hmac
from pathlib import Path
from datetime import datetime, timezone, timedelta

import os
import httpx
import pandas as pd

# JWT 생성용 — PyJWT 없으면 수동 구현
try:
    import jwt as pyjwt
    HAS_PYJWT = True
except ImportError:
    HAS_PYJWT = False

# ────────────────────────────────────────────
# 설정
# ────────────────────────────────────────────
OUTPUT = "bunjang_orders.csv"
API_BASE = "https://openapi.bunjang.co.kr"

# ★ API 키: 환경변수에서 읽어옴 (코드에 절대 하드코딩 금지!)
# 사용 전 환경변수 설정 필요:
#   Windows: set BUNJANG_ACCESS_KEY=여기에_키_입력
#            set BUNJANG_SECRET_KEY=여기에_시크릿_입력
#   Mac/Linux: export BUNJANG_ACCESS_KEY=여기에_키_입력
#              export BUNJANG_SECRET_KEY=여기에_시크릿_입력
ACCESS_KEY = os.environ.get("BUNJANG_ACCESS_KEY", "")
SECRET_KEY_B64 = os.environ.get("BUNJANG_SECRET_KEY", "")

KST = timezone(timedelta(hours=9))

STATUS_MAP = {
    # 실제 API 반환값 (v8.0에서 확인)
    "PURCHASE_CONFIRM": "구매확정",
    "DELIVERY_COMPLETED": "배송완료",
    "IN_TRANSIT": "배송중",
    "SHIP_READY": "발송준비",
    "RETURN_BEFORE_SHIPPING": "배송전취소",
    "PAYMENT_RECEIVED": "결제완료",
    "PAYMENT_PENDING": "결제대기",
    "REFUNDED": "환불",
    "CANCELLED": "취소",
    # 기존 매핑 (호환용)
    "SHIPPED": "배송중",
    "DELIVERED": "배송완료",
    "PURCHASE_CONFIRMED": "구매확정",
    "COMPLETED": "거래완료",
    "DONE": "거래완료",
    "CANCEL_REQUESTED": "취소요청",
    "RETURN_REQUESTED": "반품요청",
    "RETURNED": "반품완료",
}


# ────────────────────────────────────────────
# JWT 토큰 생성 (30초 유효)
# ────────────────────────────────────────────
def _b64url_encode(data: bytes) -> str:
    """Base64url 인코딩 (패딩 제거)"""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def generate_jwt(method: str = "GET") -> str:
    """
    번개장터 Open API JWT 토큰 생성.
    - GET: accessKey + iat
    - POST/PUT/DELETE: accessKey + nonce + iat
    """
    secret_key = base64.b64decode(SECRET_KEY_B64)

    if HAS_PYJWT:
        # PyJWT 사용
        payload = {
            "accessKey": ACCESS_KEY,
            "iat": int(time.time()),
        }
        if method.upper() in ("POST", "PUT", "DELETE"):
            payload["nonce"] = str(uuid.uuid4())
        return pyjwt.encode(payload, secret_key, algorithm="HS256")
    else:
        # 수동 JWT 구현
        header = {"alg": "HS256", "typ": "JWT"}
        payload = {
            "accessKey": ACCESS_KEY,
            "iat": int(time.time()),
        }
        if method.upper() in ("POST", "PUT", "DELETE"):
            payload["nonce"] = str(uuid.uuid4())

        h = _b64url_encode(json.dumps(header, separators=(",", ":")).encode())
        p = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
        msg = f"{h}.{p}".encode()
        sig = hmac.new(secret_key, msg, hashlib.sha256).digest()
        s = _b64url_encode(sig)
        return f"{h}.{p}.{s}"


def get_headers(method: str = "GET") -> dict:
    """API 요청 헤더 생성"""
    token = generate_jwt(method)
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


# ────────────────────────────────────────────
# 기간 분할 (최대 15일 단위)
# ────────────────────────────────────────────
def split_date_ranges(start_dt: datetime, end_dt: datetime,
                       max_days: int = 15) -> list[tuple[datetime, datetime]]:
    """시작~종료를 최대 max_days 단위로 분할"""
    ranges = []
    current = start_dt
    while current < end_dt:
        chunk_end = min(current + timedelta(days=max_days), end_dt)
        ranges.append((current, chunk_end))
        current = chunk_end
    return ranges


# ────────────────────────────────────────────
# List Orders (주문 목록)
# ────────────────────────────────────────────
async def list_orders(client: httpx.AsyncClient,
                       start_dt: datetime, end_dt: datetime,
                       page_size: int = 100, max_orders: int = 0,
                       debug: bool = False) -> list[dict]:
    """
    GET /api/v1/orders
    최대 15일 단위로 분할 호출, 페이지네이션 처리.
    """
    ranges = split_date_ranges(start_dt, end_dt)
    all_orders = []
    seen_ids = set()

    for ri, (rs, re_) in enumerate(ranges):
        start_str = rs.strftime("%Y-%m-%dT%H:%M:%SZ")
        end_str = re_.strftime("%Y-%m-%dT%H:%M:%SZ")
        print(f"\n  📅 구간 {ri+1}/{len(ranges)}: {rs.strftime('%Y-%m-%d')} ~ {re_.strftime('%Y-%m-%d')}")

        page_num = 0
        while True:
            params = {
                "statusUpdateStartDate": start_str,
                "statusUpdateEndDate": end_str,
                "page": page_num,
                "size": page_size,
            }

            headers = get_headers("GET")
            url = f"{API_BASE}/api/v1/orders"

            if debug:
                print(f"    [API] GET {url}?page={page_num}&size={page_size}")

            try:
                resp = await client.get(url, params=params, headers=headers)
            except Exception as e:
                print(f"    ❌ 요청 오류: {e}")
                break

            if resp.status_code == 401:
                print(f"    ❌ 인증 실패 (401) — API 키를 확인하세요")
                if debug:
                    print(f"    응답: {resp.text[:300]}")
                return all_orders
            elif resp.status_code != 200:
                print(f"    ❌ HTTP {resp.status_code}: {resp.text[:200]}")
                break

            data = resp.json()

            if debug and page_num == 0:
                print(f"    응답 키: {list(data.keys())}")
                print(f"    원본(500자): {json.dumps(data, ensure_ascii=False)[:500]}")

            orders = data.get("data", [])
            total_elements = data.get("totalElements", 0)
            total_pages = data.get("totalPages", 0)

            if page_num == 0:
                print(f"    📊 이 구간: {total_elements}건 ({total_pages}페이지)")

            if not orders:
                break

            new_count = 0
            for order in orders:
                oid = str(order.get("id", ""))
                if oid and oid not in seen_ids:
                    seen_ids.add(oid)
                    all_orders.append(order)
                    new_count += 1

            print(f"    page {page_num}: +{new_count}건 (누적 {len(all_orders)})")

            # 테스트 모드 체크
            if max_orders > 0 and len(all_orders) >= max_orders:
                all_orders = all_orders[:max_orders]
                print(f"    🧪 테스트 목표 {max_orders}건 도달!")
                return all_orders

            if page_num + 1 >= total_pages:
                break
            page_num += 1
            await asyncio.sleep(0.2)

    return all_orders


# ────────────────────────────────────────────
# Get Order (주문 상세 — 배송정보!)
# ────────────────────────────────────────────
async def get_order_detail(client: httpx.AsyncClient, order_id: int | str,
                            debug: bool = False) -> dict | None:
    """
    GET /api/v1/orders/{orderId}
    → delivery.invoice.companyName (택배사)
    → delivery.invoice.no (송장번호)
    """
    url = f"{API_BASE}/api/v1/orders/{order_id}"
    headers = get_headers("GET")

    try:
        resp = await client.get(url, headers=headers)
    except Exception as e:
        if debug:
            print(f"    ❌ 상세 요청 오류: {e}")
        return None

    if resp.status_code != 200:
        if debug:
            print(f"    ❌ 상세 HTTP {resp.status_code}: {resp.text[:200]}")
        return None

    data = resp.json()
    if debug:
        print(f"    ✅ 상세 조회 성공: {json.dumps(data, ensure_ascii=False)[:300]}")

    return data.get("data")


# ────────────────────────────────────────────
# 주문 정규화 (목록 + 상세 병합)
# ────────────────────────────────────────────
def normalize_order(order: dict, detail: dict = None) -> dict:
    """
    목록(List Orders) + 상세(Get Order) 데이터를 CSV 행으로 변환.
    
    목록 구조: { id, orderItems: [{ id, status, statusUpdatedAt, product: { id } }] }
    상세 구조: { order: { id, totalPrice, orderItems: [{ product: { name, price } }] },
                 delivery: { invoice: { no, companyName } }, seller: { shopName } }
    """
    r = {
        "주문번호": "",
        "날짜": "",
        "상태": "",
        "상품명": "",
        "가격": "",
        "택배사": "(없음)",
        "송장번호": "(없음)",
        "판매자": "",
    }

    # ── 주문번호 ──
    r["주문번호"] = str(order.get("id", ""))

    # ── 목록의 orderItems에서 상태 추출 ──
    items = order.get("orderItems", [])
    statuses = set()
    status_dates = []

    for item in items:
        if not isinstance(item, dict):
            continue
        st = item.get("status", "")
        if st:
            statuses.add(st)
        sdate = item.get("statusUpdatedAt", "")
        if sdate:
            status_dates.append(sdate)

    # 상태 매핑
    if statuses:
        mapped = [STATUS_MAP.get(s, s) for s in statuses]
        r["상태"] = " / ".join(sorted(set(mapped)))
    else:
        r["상태"] = "(상태 없음)"

    # 날짜: statusUpdatedAt 중 가장 최근
    if status_dates:
        latest = max(status_dates)
        try:
            dt = datetime.fromisoformat(latest.replace("Z", "+00:00"))
            r["날짜"] = dt.astimezone(KST).strftime("%Y-%m-%d %H:%M")
        except Exception:
            r["날짜"] = latest

    # ── 상세 데이터 병합 ──
    if detail:
        order_detail = detail.get("order", {})
        delivery = detail.get("delivery", {})
        seller = detail.get("seller", {})

        # 날짜: orderDoneAt (주문 완료 시점)
        order_done = order_detail.get("orderDoneAt", "")
        if order_done:
            try:
                dt = datetime.fromisoformat(order_done.replace("Z", "+00:00"))
                r["날짜"] = dt.astimezone(KST).strftime("%Y-%m-%d %H:%M")
            except Exception:
                pass

        # 가격
        total_price = order_detail.get("totalProductPrice") or order_detail.get("totalPrice")
        if total_price:
            try:
                r["가격"] = f"{int(total_price):,}원"
            except (ValueError, TypeError):
                pass

        # 상품명 (상세에만 product.name이 있음)
        detail_items = order_detail.get("orderItems", [])
        names = []
        for item in detail_items:
            if isinstance(item, dict):
                product = item.get("product", {})
                if isinstance(product, dict):
                    name = product.get("name", "")
                    if name:
                        names.append(name)
        if names:
            r["상품명"] = " / ".join(names)
        else:
            r["상품명"] = "(상품명 없음)"

        # 상태 보강 (상세의 orderItems)
        if detail_items:
            detail_statuses = set()
            for item in detail_items:
                if isinstance(item, dict):
                    st = item.get("status", "")
                    if st:
                        detail_statuses.add(st)
            if detail_statuses:
                mapped = [STATUS_MAP.get(s, s) for s in detail_statuses]
                r["상태"] = " / ".join(sorted(set(mapped)))

        # ★ 배송정보 (핵심!)
        invoice = delivery.get("invoice", {})
        if isinstance(invoice, dict):
            company = invoice.get("companyName", "")
            tracking = invoice.get("no", "")
            if company:
                r["택배사"] = company
            if tracking:
                r["송장번호"] = tracking

        # 판매자
        shop_name = seller.get("shopName", "")
        if shop_name:
            r["판매자"] = shop_name

    else:
        r["상품명"] = "(상세 미조회)"

    return r


# ────────────────────────────────────────────
# CSV 저장
# ────────────────────────────────────────────
def save_csv(results: list, output: str, is_test: bool = False):
    if not results:
        print("\n  ❌ 저장할 데이터 없음")
        return

    df = pd.DataFrame(results)
    cols = ["주문번호", "날짜", "상태", "상품명", "가격", "택배사", "송장번호", "판매자"]
    existing = [c for c in cols if c in df.columns]
    df = df[existing]
    df.to_csv(output, index=False, encoding="utf-8-sig")

    label = "🧪 테스트 결과" if is_test else "✅ 완료"
    print()
    print("=" * 70)
    print(f"  {label}: {output} ({len(df)}건)")
    print("=" * 70)
    print()

    pd.set_option('display.max_colwidth', 35)
    pd.set_option('display.width', 170)
    print(df.to_string(index=False))
    print()

    if "상태" in df.columns:
        print("📊 상태별 통계:")
        for status, cnt in df["상태"].value_counts().items():
            print(f"  {status}: {cnt}건")
        print()

    if "택배사" in df.columns:
        with_delivery = len(df[df["택배사"] != "(없음)"])
        without = len(df[df["택배사"] == "(없음)"])
        print(f"📦 배송정보: {with_delivery}건 있음 / {without}건 없음")
        if with_delivery > 0:
            print(f"   택배사 분포:")
            for carrier, cnt in df[df["택배사"] != "(없음)"]["택배사"].value_counts().items():
                print(f"     {carrier}: {cnt}건")
        print()


# ────────────────────────────────────────────
# 메인
# ────────────────────────────────────────────
async def main():
    parser = argparse.ArgumentParser(description="번개장터 주문 수집기 v8.0 (공식 Open API)")
    parser.add_argument("--test", type=int, default=0, metavar="N",
                        help="상위 N건만 수집 (빠른 테스트)")
    parser.add_argument("--days", type=int, default=15,
                        help="최근 N일 수집 (기본 15일)")
    parser.add_argument("--start", type=str, default="",
                        help="시작일 (YYYY-MM-DD)")
    parser.add_argument("--end", type=str, default="",
                        help="종료일 (YYYY-MM-DD)")
    parser.add_argument("--output", "-o", default=OUTPUT, help="출력 CSV 파일명")
    parser.add_argument("--size", type=int, default=100, help="페이지당 건수 (최대 100)")
    parser.add_argument("--no-detail", action="store_true",
                        help="상세 조회 건너뛰기 (목록만)")
    parser.add_argument("--debug", action="store_true", help="디버그 모드")
    args = parser.parse_args()

    test_count = args.test
    page_size = min(args.size, 100)

    # ★ 기간 설정 — 여기만 수정하세요 ★
    start_dt = datetime(2025, 7, 1, tzinfo=timezone.utc)   # ← 시작일
    end_dt   = datetime.now(timezone.utc)                    # ← 오늘까지

    total_days = (end_dt - start_dt).days

    print()
    print("=" * 70)
    print(f"  🛒 번개장터 주문 수집기 v8.0 (공식 Open API)")
    print(f"  📅 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  📆 수집 기간: {start_dt.strftime('%Y-%m-%d')} ~ {end_dt.strftime('%Y-%m-%d')} ({total_days}일)")
    if test_count > 0:
        print(f"  🧪 테스트 모드: {test_count}건만 수집")
    print(f"  📡 API: {API_BASE}")
    print("=" * 70)

    # ── JWT 인증 테스트 ──
    # ── API 키 확인 ──
    if not ACCESS_KEY or not SECRET_KEY_B64:
        print("\n  ❌ API 키가 설정되지 않았습니다!")
        print("  환경변수를 먼저 설정하세요:")
        print("    Windows:  set BUNJANG_ACCESS_KEY=your_key")
        print("              set BUNJANG_SECRET_KEY=your_secret")
        print("    Mac/Linux: export BUNJANG_ACCESS_KEY=your_key")
        print("               export BUNJANG_SECRET_KEY=your_secret")
        return

    print("\n🔐 API 인증 테스트...")
    token = generate_jwt("GET")
    if args.debug:
        print(f"  JWT 토큰: {token[:50]}...")
    print(f"  ✅ JWT 생성 완료 (HMAC-SHA256, 30초 유효)")

    results = []

    async with httpx.AsyncClient(timeout=30) as client:
        # ── Step 1: 주문 목록 조회 ──
        print(f"\n📦 주문 목록 조회 중...")
        orders = await list_orders(
            client, start_dt, end_dt, page_size,
            max_orders=test_count, debug=args.debug
        )

        if not orders:
            print(f"\n  ❌ 주문 없음 (기간: {start_dt.strftime('%Y-%m-%d')} ~ {end_dt.strftime('%Y-%m-%d')})")
            print(f"  💡 --days 30 또는 --start 2025-01-01 으로 기간을 넓혀보세요")
            return

        print(f"\n✅ 총 {len(orders)}건 수집!")

        # ── Step 2: 주문 상세 조회 (배송정보!) ──
        if not args.no_detail:
            print(f"\n🔍 주문 상세 조회 (배송정보 추출)...")
            print(f"  대상: {len(orders)}건\n")

            for i, order in enumerate(orders):
                order_id = order.get("id")
                if not order_id:
                    results.append(normalize_order(order))
                    continue

                # 상세 조회
                detail = await get_order_detail(client, order_id, debug=args.debug)
                normalized = normalize_order(order, detail)
                results.append(normalized)

                # 진행 출력
                name = normalized["상품명"][:28]
                st = normalized["상태"]
                price = f" {normalized['가격']}" if normalized["가격"] else ""
                trk = ""
                if normalized["송장번호"] != "(없음)":
                    trk = f" 📦{normalized['택배사']}/{normalized['송장번호']}"
                seller = f" [{normalized['판매자']}]" if normalized["판매자"] else ""
                print(f"  [{i+1:3d}/{len(orders)}] {name} | {st}{price}{trk}{seller}")

                # API 속도 제한 방지
                await asyncio.sleep(0.15)

        else:
            print(f"\n📋 목록 데이터만 정규화 (--no-detail)...")
            for order in orders:
                results.append(normalize_order(order))

        # ── CSV 저장 ──
        save_csv(results, args.output, is_test=(test_count > 0))

        # ── 요약 ──
        print("📋 요약:")
        print(f"  수집 기간: {start_dt.strftime('%Y-%m-%d')} ~ {end_dt.strftime('%Y-%m-%d')}")
        print(f"  총 주문: {len(results)}건")
        print(f"  출력 파일: {args.output}")
        print()


if __name__ == "__main__":
    asyncio.run(main())
