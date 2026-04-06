#!/bin/bash
echo ""
echo "============================================="
echo "  Bunjang Chat Monitor - Mac/Linux Install"
echo "============================================="
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python3 is not installed."
    echo "  Mac: brew install python3"
    echo "  Linux: sudo apt install python3 python3-pip"
    exit 1
fi

echo "[1/3] Installing Python packages..."
pip3 install -r requirements.txt
if [ $? -ne 0 ]; then
    echo "[ERROR] pip install failed."
    exit 1
fi

echo ""
echo "[2/3] Installing Playwright browsers..."
python3 -m playwright install chromium
if [ $? -ne 0 ]; then
    echo "[ERROR] Playwright install failed."
    exit 1
fi

echo ""
echo "[3/3] Installation complete!"
echo ""
echo "============================================="
echo "  HOW TO USE:"
echo "  python3 monitor.py"
echo "============================================="
echo ""
