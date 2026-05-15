"""
🔧 Randy Bot Konfigürasyonu
"""

import os
from dotenv import load_dotenv

load_dotenv()

# Bot Token
BOT_TOKEN = os.getenv("BOT_TOKEN", "")

# Veritabanı
DATABASE_URL = os.getenv("DATABASE_URL", "")

# Ana Grup ID (opsiyonel - belirtilirse sadece bu grupta çalışır)
ACTIVITY_GROUP_ID = int(os.getenv("ACTIVITY_GROUP_ID", "0")) or None

# Bot username (opsiyonel)
BOT_USERNAME = os.getenv("BOT_USERNAME", "")
