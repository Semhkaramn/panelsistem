"""
🗄️ Veritabanı Bağlantısı
Neon.tech PostgreSQL için asyncpg kullanır
"""

import asyncpg
import asyncio
from typing import Optional
from config import DATABASE_URL

import logging
logger = logging.getLogger(__name__)


class Database:
    """PostgreSQL veritabanı yöneticisi"""

    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None
        self._connected = False

    async def connect(self):
        """Veritabanı bağlantı havuzu oluştur"""
        try:
            self.pool = await asyncpg.create_pool(
                DATABASE_URL,
                min_size=1,
                max_size=5,
                command_timeout=30,
                timeout=10,
                statement_cache_size=0  # Neon.tech için cache kapalı
            )

            self._connected = True

            # Tabloları oluştur
            await self._create_tables()

            logger.info("✅ Veritabanına bağlanıldı")

        except Exception as e:
            logger.error(f"❌ Veritabanı bağlantı hatası: {e}")
            raise

    async def _create_tables(self):
        """Gerekli tabloları oluştur"""
        async with self.pool.acquire() as conn:
            # Telegram Grupları
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS telegram_groups (
                    id SERIAL PRIMARY KEY,
                    group_id BIGINT UNIQUE NOT NULL,
                    title TEXT,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """)

            # Grup Adminleri Cache
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS group_admins (
                    id SERIAL PRIMARY KEY,
                    group_id BIGINT NOT NULL,
                    user_id BIGINT NOT NULL,
                    is_admin BOOLEAN DEFAULT TRUE,
                    updated_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(group_id, user_id)
                )
            """)

            # Telegram Kullanıcıları (mesaj istatistikleri)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS telegram_users (
                    id SERIAL PRIMARY KEY,
                    telegram_id BIGINT NOT NULL,
                    group_id BIGINT NOT NULL,
                    username TEXT,
                    first_name TEXT,
                    last_name TEXT,
                    message_count INT DEFAULT 0,
                    daily_count INT DEFAULT 0,
                    weekly_count INT DEFAULT 0,
                    monthly_count INT DEFAULT 0,
                    activity_count INT DEFAULT 0,
                    last_message_at TIMESTAMP,
                    last_daily_reset TIMESTAMP DEFAULT NOW(),
                    last_weekly_reset TIMESTAMP DEFAULT NOW(),
                    last_monthly_reset TIMESTAMP DEFAULT NOW(),
                    last_activity_reset TIMESTAMP DEFAULT NOW(),
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(telegram_id, group_id)
                )
            """)

            # Randy Taslakları (Kalıcı Ayarlar)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS randy_drafts (
                    id SERIAL PRIMARY KEY,
                    creator_id BIGINT NOT NULL,
                    group_id BIGINT,
                    title TEXT,
                    message TEXT,
                    media_type TEXT DEFAULT 'none',
                    media_file_id TEXT,
                    requirement_type TEXT DEFAULT 'none',
                    required_message_count INT DEFAULT 0,
                    winner_count INT DEFAULT 1,
                    pin_message BOOLEAN DEFAULT FALSE,
                    is_enabled BOOLEAN DEFAULT TRUE,
                    admin_can_join BOOLEAN DEFAULT FALSE,
                    selected_channel_id BIGINT,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """)

            # Randy (Çekiliş) Kayıtları
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS randy (
                    id SERIAL PRIMARY KEY,
                    group_id BIGINT NOT NULL,
                    creator_id BIGINT NOT NULL,
                    title TEXT NOT NULL,
                    message TEXT,
                    media_type TEXT DEFAULT 'none',
                    media_file_id TEXT,
                    requirement_type TEXT DEFAULT 'none',
                    required_message_count INT DEFAULT 0,
                    winner_count INT DEFAULT 1,
                    status TEXT DEFAULT 'draft',
                    message_id BIGINT,
                    pin_message BOOLEAN DEFAULT FALSE,
                    admin_can_join BOOLEAN DEFAULT FALSE,
                    opened_in_channel_id BIGINT,
                    started_at TIMESTAMP,
                    ended_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """)

            # Randy Katılımcıları
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS randy_participants (
                    id SERIAL PRIMARY KEY,
                    randy_id INT REFERENCES randy(id) ON DELETE CASCADE,
                    telegram_id BIGINT NOT NULL,
                    username TEXT,
                    first_name TEXT,
                    post_randy_message_count INT DEFAULT 0,
                    joined_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(randy_id, telegram_id)
                )
            """)

            # Randy Kazananları
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS randy_winners (
                    id SERIAL PRIMARY KEY,
                    randy_id INT REFERENCES randy(id) ON DELETE CASCADE,
                    telegram_id BIGINT NOT NULL,
                    username TEXT,
                    first_name TEXT,
                    won_at TIMESTAMP DEFAULT NOW()
                )
            """)

            # Randy Kanalları (Zorunlu takip edilecek kanallar)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS randy_channels (
                    id SERIAL PRIMARY KEY,
                    randy_draft_id INT,
                    randy_id INT,
                    channel_id BIGINT,
                    channel_username TEXT,
                    channel_title TEXT,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """)

            # Randy İzin Verilen Kanallar/Gruplar (Nerede açılabilir)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS randy_allowed_channels (
                    id SERIAL PRIMARY KEY,
                    draft_id INT NOT NULL,
                    channel_id BIGINT NOT NULL,
                    channel_title TEXT,
                    channel_username TEXT,
                    is_enabled BOOLEAN DEFAULT TRUE,
                    no_requirement BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(draft_id, channel_id)
                )
            """)

            # Eksik kolonları ekle (migration yerine)
            try:
                await conn.execute("ALTER TABLE randy_drafts ADD COLUMN IF NOT EXISTS admin_can_join BOOLEAN DEFAULT FALSE")
            except:
                pass

            try:
                await conn.execute("ALTER TABLE randy_drafts ADD COLUMN IF NOT EXISTS selected_channel_id BIGINT")
            except:
                pass

            try:
                await conn.execute("ALTER TABLE randy ADD COLUMN IF NOT EXISTS admin_can_join BOOLEAN DEFAULT FALSE")
            except:
                pass

            try:
                await conn.execute("ALTER TABLE randy ADD COLUMN IF NOT EXISTS opened_in_channel_id BIGINT")
            except:
                pass

            try:
                await conn.execute("ALTER TABLE randy_allowed_channels ADD COLUMN IF NOT EXISTS no_requirement BOOLEAN DEFAULT FALSE")
            except:
                pass

            try:
                await conn.execute("ALTER TABLE telegram_users ADD COLUMN IF NOT EXISTS activity_count INT DEFAULT 0")
            except:
                pass

            try:
                await conn.execute("ALTER TABLE telegram_users ADD COLUMN IF NOT EXISTS last_activity_reset TIMESTAMP DEFAULT NOW()")
            except:
                pass

            # Indexler
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_randy_status ON randy(status)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_randy_group ON randy(group_id)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_randy_status_group ON randy(status, group_id)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_users_group ON telegram_users(group_id)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_users_telegram_group ON telegram_users(telegram_id, group_id)")

            logger.info("✅ Tablolar oluşturuldu/kontrol edildi")

    async def close(self):
        """Bağlantı havuzunu kapat"""
        if self.pool:
            try:
                await asyncio.wait_for(self.pool.close(), timeout=5.0)
                self._connected = False
                logger.info("🔌 Veritabanı bağlantısı kapatıldı")
            except asyncio.TimeoutError:
                logger.warning("⚠️ Veritabanı kapatma timeout")
            except Exception as e:
                logger.error(f"❌ Veritabanı kapatma hatası: {e}")

    @property
    def is_connected(self) -> bool:
        """Bağlantı durumunu döndür"""
        return self._connected and self.pool is not None


# Singleton instance
db = Database()
