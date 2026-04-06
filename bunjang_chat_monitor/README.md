# Bunjang Chat Monitor v2.1 - Auto Login Edition

## Overview
Real-time chat notification monitor for Bunjang marketplace.
**Auto-login** using the same data as the Chrome extension (name, birth date, phone, carrier).
Detects new messages via Firebase Firestore REST API polling.

## Quick Start (Windows)

### 1. Install (one time)
Double-click `install_windows.bat`

### 2. Run
Double-click `start.bat`

### What happens:
1. Browser opens automatically
2. Goes to Bunjang signup/auth page
3. **Auto-fills**: name, birth date, phone, carrier (from config.py)
4. **Auto-clicks**: agree all, next, submit
5. **You only need to**: enter SMS verification code (if not in config)
6. Monitor starts - polls every 3 seconds for new messages

### Next runs:
Session is saved! Just double-click `start.bat` - no login needed.

## Commands

| Command | Description |
|---------|-------------|
| `python monitor.py` | Normal start (uses saved session) |
| `python monitor.py --login` | Force re-login (auto-fill again) |
| `python monitor.py --test` | Test notifications |

## Configuration (config.py)

### Auto-login data (from Chrome extension):
```python
SIGNUP_DATA = {
    "name": "김번장",
    "birth_front": "710819",
    "birth_back": "2",
    "phone": "01410051898",
    "carrier": "LGT",
    "verification_code": "",  # Leave empty for manual SMS input
}
```

### Telegram notifications (optional):
```python
TELEGRAM_BOT_TOKEN = "your-bot-token"
TELEGRAM_CHAT_ID = "your-chat-id"
```

## How It Works

```
start.bat
  -> monitor.py
    -> [Check saved token]
      -> Valid? -> Start polling
      -> Expired? -> Auto-login:
        1. Open m.bunjang.co.kr/signup
        2. Auto-fill form (name, birth, phone, carrier)
        3. Auto-click (agree, next, submit)
        4. Wait for SMS code (manual or auto)
        5. Extract Firebase token
    -> Poll Firestore every 3s
    -> Detect new/updated messages
    -> Send notification (Windows + Telegram)
```

## Files

| File | Description |
|------|-------------|
| monitor.py | Main script (auto-login + monitoring) |
| config.py | Settings (login data, Telegram, intervals) |
| notifier.py | Notification system (Windows toast + Telegram) |
| requirements.txt | Python dependencies |
| install_windows.bat | Windows installer |
| start.bat | Windows launcher |
| install_mac_linux.sh | Mac/Linux installer |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Browser crashes on login | v2.1 uses mobile web (no popups) - should not crash |
| Form fields not filled | XPath may have changed - check Bunjang signup page structure |
| Token expired | Run `python monitor.py --login` |
| No messages detected | Verify you can see chats on m.bunjang.co.kr/talk2 |
| Telegram not working | Check bot token and chat ID in config.py |

## Requirements
- Python 3.10+
- Windows 10+ / macOS / Linux
- Internet connection
