"""
번개장터 채팅 모니터 - 알림 모듈
=================================
윈도우 시스템 알림 + 텔레그램 봇 알림
"""

import json
import logging
import urllib.request
import urllib.parse
from config import TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, NOTIFICATION_TITLE

logger = logging.getLogger("notifier")


class NotificationManager:
    """알림 관리자 - 윈도우 토스트 + 텔레그램"""

    def __init__(self):
        self.telegram_enabled = bool(TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)
        self.toast_available = False

        # Windows 토스트 알림 시도
        try:
            from win10toast import ToastNotifier
            self.toaster = ToastNotifier()
            self.toast_available = True
            logger.info("[OK] Windows toast notification ready")
        except ImportError:
            logger.info("[INFO] win10toast not installed - Windows notifications disabled")
        except Exception:
            logger.info("[INFO] Windows toast not available on this OS")

        if self.telegram_enabled:
            logger.info("[OK] Telegram notification ready")
        else:
            logger.info("[INFO] Telegram not configured - edit config.py to enable")

    def send(self, title: str, message: str, sender: str = ""):
        """알림 전송 (모든 채널)"""
        display_title = title or NOTIFICATION_TITLE

        # 1) 콘솔 출력 (항상)
        print(f"\n{'='*50}")
        print(f"  [NEW MESSAGE] {display_title}")
        if sender:
            print(f"  From: {sender}")
        print(f"  {message}")
        print(f"{'='*50}\n")

        # 2) Windows 토스트
        if self.toast_available:
            try:
                toast_msg = f"{sender}: {message}" if sender else message
                self.toaster.show_toast(
                    display_title,
                    toast_msg[:200],
                    duration=5,
                    threaded=True
                )
            except Exception as e:
                logger.debug(f"Toast error: {e}")

        # 3) 텔레그램
        if self.telegram_enabled:
            self._send_telegram(display_title, message, sender)

    def _send_telegram(self, title: str, message: str, sender: str = ""):
        """텔레그램 봇으로 메시지 전송"""
        try:
            text_parts = [f"[{title}]"]
            if sender:
                text_parts.append(f"From: {sender}")
            text_parts.append(message)
            text = "\n".join(text_parts)

            url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
            data = urllib.parse.urlencode({
                "chat_id": TELEGRAM_CHAT_ID,
                "text": text,
            }).encode("utf-8")

            req = urllib.request.Request(url, data=data)
            with urllib.request.urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read())
                if result.get("ok"):
                    logger.debug("Telegram sent OK")
                else:
                    logger.warning(f"Telegram API error: {result}")
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            logger.warning(f"Telegram send failed: {e.code} {body}")
        except Exception as e:
            logger.warning(f"Telegram send failed: {e}")

    def test(self):
        """알림 테스트"""
        self.send(
            "Test Notification",
            "If you see this, notifications are working!",
            "System"
        )
