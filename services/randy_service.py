"""
🎲 Randy Servisi
Randy oluşturma, başlatma, katılım ve sonlandırma işlemleri
Kanal yönetimi, admin katılımı ve açma/kapama özellikleri
"""

import random
from datetime import datetime
from typing import Optional, Dict, Any, List, Tuple
from database import db
import logging

logger = logging.getLogger(__name__)

# Status tipleri
STATUS_DRAFT = 'draft'
STATUS_ACTIVE = 'active'
STATUS_ENDED = 'ended'


# ============================================
# GRUP YÖNETİMİ
# ============================================

async def register_group(group_id: int, title: str) -> bool:
    """Grubu veritabanına kaydet"""
    try:
        async with db.pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO telegram_groups (group_id, title, is_active)
                VALUES ($1, $2, TRUE)
                ON CONFLICT (group_id)
                DO UPDATE SET title = $2, is_active = TRUE
            """, group_id, title)
            return True
    except Exception as e:
        logger.error(f"❌ Grup kayıt hatası: {e}")
        return False


async def update_group_admin(group_id: int, user_id: int, is_admin: bool) -> bool:
    """Grup admin kaydını güncelle"""
    try:
        async with db.pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO group_admins (group_id, user_id, is_admin, updated_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (group_id, user_id)
                DO UPDATE SET is_admin = $3, updated_at = NOW()
            """, group_id, user_id, is_admin)
            return True
    except Exception as e:
        logger.error(f"❌ Admin güncelleme hatası: {e}")
        return False


async def get_user_admin_groups(creator_id: int, bot=None) -> List[Dict]:
    """Kullanıcının admin olduğu grupları getir"""
    try:
        async with db.pool.acquire() as conn:
            groups = await conn.fetch("""
                SELECT g.group_id, g.title
                FROM telegram_groups g
                JOIN group_admins a ON g.group_id = a.group_id
                WHERE a.user_id = $1 AND a.is_admin = TRUE AND g.is_active = TRUE
            """, creator_id)
            return [dict(g) for g in groups]
    except Exception as e:
        logger.error(f"❌ Admin grupları getirme hatası: {e}")
        return []


# ============================================
# TASLAK YÖNETİMİ
# ============================================

async def get_or_create_group_draft(creator_id: int, group_id: int) -> Optional[Dict[str, Any]]:
    """Grup için mevcut taslağı getir veya yeni oluştur"""
    try:
        async with db.pool.acquire() as conn:
            draft = await conn.fetchrow("""
                SELECT * FROM randy_drafts
                WHERE group_id = $1
                ORDER BY updated_at DESC
                LIMIT 1
            """, group_id)

            if draft:
                return dict(draft)

            # Yoksa yeni taslak oluştur
            draft_id = await conn.fetchval("""
                INSERT INTO randy_drafts (creator_id, group_id, is_enabled, admin_can_join)
                VALUES ($1, $2, TRUE, FALSE)
                RETURNING id
            """, creator_id, group_id)

            if draft_id:
                draft = await conn.fetchrow("""
                    SELECT * FROM randy_drafts WHERE id = $1
                """, draft_id)
                return dict(draft) if draft else None

            return None
    except Exception as e:
        logger.error(f"❌ Grup taslağı getirme/oluşturma hatası: {e}")
        return None


async def get_draft(creator_id: int, group_id: int = None) -> Optional[Dict[str, Any]]:
    """Kullanıcının taslağını getir"""
    try:
        async with db.pool.acquire() as conn:
            if group_id:
                draft = await conn.fetchrow("""
                    SELECT * FROM randy_drafts
                    WHERE group_id = $1
                    ORDER BY updated_at DESC
                    LIMIT 1
                """, group_id)
            else:
                draft = await conn.fetchrow("""
                    SELECT * FROM randy_drafts WHERE creator_id = $1
                    ORDER BY updated_at DESC
                    LIMIT 1
                """, creator_id)

            if draft:
                return dict(draft)
            return None
    except Exception as e:
        logger.error(f"❌ Taslak getirme hatası: {e}")
        return None


async def get_group_draft(group_id: int) -> Optional[Dict[str, Any]]:
    """Grup için sabit ayarları getir"""
    try:
        async with db.pool.acquire() as conn:
            draft = await conn.fetchrow("""
                SELECT * FROM randy_drafts
                WHERE group_id = $1
                ORDER BY updated_at DESC
                LIMIT 1
            """, group_id)

            if draft:
                return dict(draft)
            return None
    except Exception as e:
        logger.error(f"❌ Grup ayarları getirme hatası: {e}")
        return None


async def update_draft(creator_id: int, group_id: int = None, **kwargs) -> bool:
    """Taslağı güncelle"""
    try:
        async with db.pool.acquire() as conn:
            set_clauses = []
            values = []
            i = 1

            for key, value in kwargs.items():
                if key != 'group_id':
                    set_clauses.append(f"{key} = ${i}")
                    values.append(value)
                    i += 1

            if not set_clauses:
                return True

            if group_id:
                query = f"""
                    UPDATE randy_drafts
                    SET {', '.join(set_clauses)}, updated_at = NOW()
                    WHERE group_id = ${i}
                """
                values.append(group_id)
            else:
                query = f"""
                    UPDATE randy_drafts
                    SET {', '.join(set_clauses)}, updated_at = NOW()
                    WHERE creator_id = ${i}
                """
                values.append(creator_id)

            await conn.execute(query, *values)
            return True
    except Exception as e:
        logger.error(f"❌ Taslak güncelleme hatası: {e}")
        return False


# ============================================
# ADMİN KATILIM AYARI
# ============================================

async def toggle_admin_can_join(group_id: int) -> Tuple[bool, bool]:
    """Admin katılımını aç/kapat - (başarılı mı, yeni durum)"""
    try:
        async with db.pool.acquire() as conn:
            current = await conn.fetchval("""
                SELECT admin_can_join FROM randy_drafts
                WHERE group_id = $1
            """, group_id)

            if current is None:
                return False, False

            new_value = not current
            await conn.execute("""
                UPDATE randy_drafts
                SET admin_can_join = $1, updated_at = NOW()
                WHERE group_id = $2
            """, new_value, group_id)

            return True, new_value
    except Exception as e:
        logger.error(f"❌ Admin katılım toggle hatası: {e}")
        return False, False


async def get_admin_can_join(group_id: int) -> bool:
    """Admin katılabilir mi"""
    try:
        async with db.pool.acquire() as conn:
            result = await conn.fetchval("""
                SELECT admin_can_join FROM randy_drafts
                WHERE group_id = $1
            """, group_id)
            return result or False
    except Exception as e:
        logger.error(f"❌ Admin katılım durumu hatası: {e}")
        return False


# ============================================
# KANAL AÇ/KAPAT YÖNETİMİ (Nerede açılabilir)
# ============================================

async def add_allowed_channel(draft_id: int, channel_id: int, title: str = None, username: str = None, no_requirement: bool = False) -> Tuple[bool, str]:
    """Randy'nin açılabileceği kanal ekle"""
    try:
        async with db.pool.acquire() as conn:
            existing = await conn.fetchval("""
                SELECT id FROM randy_allowed_channels
                WHERE draft_id = $1 AND channel_id = $2
            """, draft_id, channel_id)

            if existing:
                return False, "Bu kanal zaten ekli"

            await conn.execute("""
                INSERT INTO randy_allowed_channels (draft_id, channel_id, channel_title, channel_username, is_enabled, no_requirement)
                VALUES ($1, $2, $3, $4, TRUE, $5)
            """, draft_id, channel_id, title, username, no_requirement)

            return True, "Kanal eklendi"
    except Exception as e:
        logger.error(f"❌ Kanal ekleme hatası: {e}")
        return False, str(e)


async def remove_allowed_channel(draft_id: int, channel_id: int) -> bool:
    """Randy açılabilir kanalı sil"""
    try:
        async with db.pool.acquire() as conn:
            await conn.execute("""
                DELETE FROM randy_allowed_channels
                WHERE draft_id = $1 AND channel_id = $2
            """, draft_id, channel_id)
            return True
    except Exception as e:
        logger.error(f"❌ Kanal silme hatası: {e}")
        return False


async def toggle_allowed_channel(draft_id: int, channel_id: int) -> Tuple[bool, bool]:
    """Kanalı aç/kapat - (başarılı mı, yeni durum)"""
    try:
        async with db.pool.acquire() as conn:
            current = await conn.fetchval("""
                SELECT is_enabled FROM randy_allowed_channels
                WHERE draft_id = $1 AND channel_id = $2
            """, draft_id, channel_id)

            if current is None:
                return False, False

            new_value = not current
            await conn.execute("""
                UPDATE randy_allowed_channels
                SET is_enabled = $1
                WHERE draft_id = $2 AND channel_id = $3
            """, new_value, draft_id, channel_id)

            return True, new_value
    except Exception as e:
        logger.error(f"❌ Kanal toggle hatası: {e}")
        return False, False


async def toggle_channel_no_requirement(draft_id: int, channel_id: int) -> Tuple[bool, bool]:
    """Kanal şartsız açılma ayarını toggle et - (başarılı mı, yeni durum)"""
    try:
        async with db.pool.acquire() as conn:
            current = await conn.fetchval("""
                SELECT no_requirement FROM randy_allowed_channels
                WHERE draft_id = $1 AND channel_id = $2
            """, draft_id, channel_id)

            if current is None:
                return False, False

            new_value = not current
            await conn.execute("""
                UPDATE randy_allowed_channels
                SET no_requirement = $1
                WHERE draft_id = $2 AND channel_id = $3
            """, new_value, draft_id, channel_id)

            return True, new_value
    except Exception as e:
        logger.error(f"❌ Şartsız açılma toggle hatası: {e}")
        return False, False


async def get_allowed_channels(draft_id: int) -> List[Dict]:
    """Randy açılabilir kanalları getir"""
    try:
        async with db.pool.acquire() as conn:
            channels = await conn.fetch("""
                SELECT channel_id, channel_title, channel_username, is_enabled, no_requirement
                FROM randy_allowed_channels
                WHERE draft_id = $1
                ORDER BY created_at
            """, draft_id)
            return [dict(c) for c in channels]
    except Exception as e:
        logger.error(f"❌ Kanal listesi hatası: {e}")
        return []


async def is_randy_enabled_for_channel(group_id: int, channel_id: int) -> Tuple[bool, bool]:
    """Bu kanalda Randy açık mı ve şartsız mı - (açık mı, şartsız mı)"""
    try:
        async with db.pool.acquire() as conn:
            # Önce draft'ı bul
            draft = await conn.fetchrow("""
                SELECT id FROM randy_drafts WHERE group_id = $1
            """, group_id)

            if not draft:
                # Draft yoksa, varsayılan olarak açık ve şartlı
                return True, False

            # Kanal listesini kontrol et
            channel = await conn.fetchrow("""
                SELECT is_enabled, no_requirement FROM randy_allowed_channels
                WHERE draft_id = $1 AND channel_id = $2
            """, draft['id'], channel_id)

            if not channel:
                # Liste boşsa veya kanal eklenmemişse
                count = await conn.fetchval("""
                    SELECT COUNT(*) FROM randy_allowed_channels WHERE draft_id = $1
                """, draft['id'])

                # Eğer hiç kanal eklenmemişse, herkese açık ve şartlı
                if count == 0:
                    return True, False
                # Kanal listesi var ama bu kanal eklenmemişse, kapalı
                return False, False

            return channel['is_enabled'], channel['no_requirement'] or False
    except Exception as e:
        logger.error(f"❌ Kanal kontrolü hatası: {e}")
        return True, False  # Hata durumunda açık ve şartlı kabul et


async def set_selected_channel(group_id: int, channel_id: int) -> bool:
    """Seçili kanalı ayarla (Randy nerede açılacak)"""
    try:
        async with db.pool.acquire() as conn:
            await conn.execute("""
                UPDATE randy_drafts
                SET selected_channel_id = $1, updated_at = NOW()
                WHERE group_id = $2
            """, channel_id, group_id)
            return True
    except Exception as e:
        logger.error(f"❌ Seçili kanal ayarlama hatası: {e}")
        return False


async def get_selected_channel(group_id: int) -> Optional[int]:
    """Seçili kanalı getir"""
    try:
        async with db.pool.acquire() as conn:
            return await conn.fetchval("""
                SELECT selected_channel_id FROM randy_drafts
                WHERE group_id = $1
            """, group_id)
    except Exception as e:
        logger.error(f"❌ Seçili kanal getirme hatası: {e}")
        return None


# ============================================
# ZORUNLU KANAL YÖNETİMİ
# ============================================

async def add_channel_to_draft(creator_id: int, channel_id: int, channel_username: str = None, channel_title: str = None, group_id: int = None) -> Tuple[bool, str]:
    """Taslağa zorunlu kanal ekle"""
    try:
        draft = await get_draft(creator_id, group_id)
        if not draft:
            return False, "Taslak bulunamadı"

        async with db.pool.acquire() as conn:
            existing = await conn.fetchval("""
                SELECT id FROM randy_channels
                WHERE randy_draft_id = $1 AND channel_id = $2
            """, draft['id'], channel_id)

            if existing:
                return False, "Bu kanal zaten ekli"

            await conn.execute("""
                INSERT INTO randy_channels (randy_draft_id, channel_id, channel_username, channel_title)
                VALUES ($1, $2, $3, $4)
            """, draft['id'], channel_id, channel_username, channel_title)

            return True, "Kanal eklendi"
    except Exception as e:
        logger.error(f"❌ Kanal ekleme hatası: {e}")
        return False, str(e)


async def remove_channel_from_draft(creator_id: int, channel_id: int, group_id: int = None) -> bool:
    """Taslaktan zorunlu kanal sil"""
    try:
        draft = await get_draft(creator_id, group_id)
        if not draft:
            return False

        async with db.pool.acquire() as conn:
            await conn.execute("""
                DELETE FROM randy_channels
                WHERE randy_draft_id = $1 AND channel_id = $2
            """, draft['id'], channel_id)
            return True
    except Exception as e:
        logger.error(f"❌ Kanal silme hatası: {e}")
        return False


async def get_draft_channels(creator_id: int, group_id: int = None) -> List[Dict]:
    """Taslağa eklenen zorunlu kanalları getir"""
    try:
        draft = await get_draft(creator_id, group_id)
        if not draft:
            return []

        async with db.pool.acquire() as conn:
            channels = await conn.fetch("""
                SELECT channel_id, channel_username, channel_title
                FROM randy_channels
                WHERE randy_draft_id = $1
                ORDER BY created_at
            """, draft['id'])
            return [dict(c) for c in channels]
    except Exception as e:
        logger.error(f"❌ Kanal listesi hatası: {e}")
        return []


async def clear_draft_channels(creator_id: int, group_id: int = None) -> bool:
    """Taslaktaki tüm zorunlu kanalları sil"""
    try:
        draft = await get_draft(creator_id, group_id)
        if not draft:
            return False

        async with db.pool.acquire() as conn:
            await conn.execute("""
                DELETE FROM randy_channels WHERE randy_draft_id = $1
            """, draft['id'])
            return True
    except Exception as e:
        logger.error(f"❌ Kanal temizleme hatası: {e}")
        return False


async def get_randy_channels(randy_id: int) -> List[Dict]:
    """Randy'nin zorunlu kanallarını getir"""
    try:
        async with db.pool.acquire() as conn:
            channels = await conn.fetch("""
                SELECT channel_id, channel_username, channel_title
                FROM randy_channels
                WHERE randy_id = $1
                ORDER BY created_at
            """, randy_id)
            return [dict(c) for c in channels]
    except Exception as e:
        logger.error(f"❌ Randy kanal listesi hatası: {e}")
        return []


# ============================================
# RANDY YÖNETİMİ
# ============================================

async def start_randy(group_id: int, creator_id: int, message_id: int = None, opened_in_channel_id: int = None) -> Tuple[bool, Optional[Dict]]:
    """Randy başlat"""
    try:
        from config import ACTIVITY_GROUP_ID

        # Grup için taslak bul
        draft = await get_group_draft(group_id)

        if not draft and ACTIVITY_GROUP_ID and ACTIVITY_GROUP_ID != 0:
            draft = await get_group_draft(ACTIVITY_GROUP_ID)

        if not draft:
            return False, None

        # Randy açık mı kontrol et
        if not draft.get('is_enabled', True):
            return False, {"error": "disabled"}

        # Kanal bazlı kontrol
        is_enabled = True
        no_requirement = False

        if opened_in_channel_id:
            is_enabled, no_requirement = await is_randy_enabled_for_channel(group_id, opened_in_channel_id)
            if not is_enabled:
                return False, {"error": "channel_disabled"}

        async with db.pool.acquire() as conn:
            # Aktif Randy var mı kontrol et
            existing = await conn.fetchval("""
                SELECT id FROM randy WHERE group_id = $1 AND status = $2
            """, group_id, STATUS_ACTIVE)

            if existing:
                return False, {"error": "already_active"}

            # Şart tipini belirle - kanal şartsız ise 'none' yap
            requirement_type = draft.get('requirement_type', 'none')
            required_message_count = draft.get('required_message_count', 0)

            if no_requirement:
                requirement_type = 'none'
                required_message_count = 0

            # Randy oluştur
            randy_id = await conn.fetchval("""
                INSERT INTO randy (
                    group_id, creator_id, title, message, media_type, media_file_id,
                    requirement_type, required_message_count, winner_count,
                    pin_message, status, message_id, admin_can_join, opened_in_channel_id, started_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
                RETURNING id
            """,
                group_id, creator_id, 'RANDY', draft['message'],
                draft.get('media_type', 'none'), draft.get('media_file_id'),
                requirement_type, required_message_count,
                draft.get('winner_count', 1), draft.get('pin_message', False),
                STATUS_ACTIVE, message_id, draft.get('admin_can_join', False), opened_in_channel_id
            )

            # Taslaktaki zorunlu kanalları Randy'ye kopyala
            draft_channels = await conn.fetch("""
                SELECT channel_id, channel_username, channel_title
                FROM randy_channels
                WHERE randy_draft_id = $1
            """, draft['id'])

            for ch in draft_channels:
                await conn.execute("""
                    INSERT INTO randy_channels (randy_id, channel_id, channel_username, channel_title)
                    VALUES ($1, $2, $3, $4)
                """, randy_id, ch['channel_id'], ch['channel_username'], ch['channel_title'])

            return True, {
                "id": randy_id,
                "title": draft.get('title', 'RANDY'),
                "message": draft['message'],
                "media_type": draft.get('media_type', 'none'),
                "media_file_id": draft.get('media_file_id'),
                "requirement_type": requirement_type,
                "required_message_count": required_message_count,
                "winner_count": draft.get('winner_count', 1),
                "pin_message": draft.get('pin_message', False),
                "admin_can_join": draft.get('admin_can_join', False),
                "no_requirement": no_requirement
            }
    except Exception as e:
        logger.error(f"❌ Randy başlatma hatası: {e}")
        return False, None


async def get_active_randy(group_id: int) -> Optional[Dict[str, Any]]:
    """Grupta aktif Randy'yi getir"""
    try:
        async with db.pool.acquire() as conn:
            randy = await conn.fetchrow("""
                SELECT * FROM randy WHERE group_id = $1 AND status = $2
            """, group_id, STATUS_ACTIVE)

            if randy:
                return dict(randy)
            return None
    except Exception as e:
        logger.error(f"❌ Aktif Randy getirme hatası: {e}")
        return None


async def get_randy_by_id(randy_id: int) -> Optional[Dict[str, Any]]:
    """Randy'yi ID ile getir"""
    try:
        async with db.pool.acquire() as conn:
            randy = await conn.fetchrow("""
                SELECT * FROM randy WHERE id = $1
            """, randy_id)

            if randy:
                return dict(randy)
            return None
    except Exception as e:
        logger.error(f"❌ Randy getirme hatası: {e}")
        return None


async def get_randy_by_message_id(group_id: int, message_id: int) -> Optional[Dict[str, Any]]:
    """Mesaj ID'sine göre Randy'yi getir"""
    try:
        async with db.pool.acquire() as conn:
            randy = await conn.fetchrow("""
                SELECT * FROM randy
                WHERE group_id = $1 AND message_id = $2
            """, group_id, message_id)

            if randy:
                return dict(randy)
            return None
    except Exception as e:
        logger.error(f"❌ Randy mesaj ID ile getirme hatası: {e}")
        return None


async def update_randy_message_id(randy_id: int, message_id: int) -> bool:
    """Randy mesaj ID'sini güncelle"""
    try:
        async with db.pool.acquire() as conn:
            await conn.execute("""
                UPDATE randy SET message_id = $1 WHERE id = $2
            """, message_id, randy_id)
            return True
    except Exception as e:
        logger.error(f"❌ Randy mesaj ID güncelleme hatası: {e}")
        return False


async def update_randy_winner_count(randy_id: int, winner_count: int) -> bool:
    """Randy kazanan sayısını güncelle"""
    try:
        async with db.pool.acquire() as conn:
            await conn.execute("""
                UPDATE randy SET winner_count = $1 WHERE id = $2 AND status = 'active'
            """, winner_count, randy_id)
            return True
    except Exception as e:
        logger.error(f"❌ Randy kazanan sayısı güncelleme hatası: {e}")
        return False


async def update_draft_winner_count(group_id: int, winner_count: int) -> bool:
    """Taslak kazanan sayısını güncelle"""
    try:
        async with db.pool.acquire() as conn:
            await conn.execute("""
                UPDATE randy_drafts SET winner_count = $1, updated_at = NOW()
                WHERE group_id = $2
            """, winner_count, group_id)
            return True
    except Exception as e:
        logger.error(f"❌ Taslak kazanan sayısı güncelleme hatası: {e}")
        return False


# ============================================
# KATILIM YÖNETİMİ
# ============================================

async def join_randy(randy_id: int, user_id: int, username: str = None, first_name: str = None, bot=None) -> Tuple[bool, str]:
    """Randy'ye katıl"""
    try:
        randy = await get_randy_by_id(randy_id)

        if not randy:
            return False, "bulunamadi"

        if randy['status'] != STATUS_ACTIVE:
            return False, "aktif_degil"

        # Admin kontrolü - admin_can_join ayarına bak
        if bot and randy.get('group_id'):
            try:
                from utils.admin_check import is_group_admin
                is_admin = await is_group_admin(bot, randy['group_id'], user_id)
                if is_admin and not randy.get('admin_can_join', False):
                    return False, "admin_katilamaz"
            except Exception as e:
                logger.warning(f"⚠️ Admin kontrolü hatası: {e}")

        async with db.pool.acquire() as conn:
            # Zaten katılmış mı?
            existing = await conn.fetchrow("""
                SELECT id, username, first_name, post_randy_message_count FROM randy_participants
                WHERE randy_id = $1 AND telegram_id = $2
            """, randy_id, user_id)

            if existing and (existing['username'] is not None or existing['first_name'] is not None):
                return False, "zaten_katildi"

            # Kanal üyelik kontrolü
            if bot:
                from utils.admin_check import is_chat_member
                from config import ACTIVITY_GROUP_ID

                not_member_channels = []

                # Activity group kontrolü
                if ACTIVITY_GROUP_ID and ACTIVITY_GROUP_ID != 0:
                    is_member = await is_chat_member(bot, ACTIVITY_GROUP_ID, user_id)
                    if not is_member:
                        try:
                            activity_chat = await bot.get_chat(ACTIVITY_GROUP_ID)
                            if activity_chat.username:
                                activity_name = f"@{activity_chat.username}"
                            else:
                                activity_name = activity_chat.title or "Ana Grup"
                        except:
                            activity_name = "Ana Grup"
                        not_member_channels.append(activity_name)

                # Zorunlu kanalları kontrol et
                channels = await get_randy_channels(randy_id)
                for channel in channels:
                    is_member = await is_chat_member(bot, channel['channel_id'], user_id)
                    if not is_member:
                        channel_name = f"@{channel['channel_username']}" if channel['channel_username'] else channel['channel_title']
                        not_member_channels.append(channel_name)

                if not_member_channels:
                    return False, f"kanal_uyesi_degil:{', '.join(not_member_channels)}"

            # Şart kontrolü
            if randy['requirement_type'] != 'none':
                req_type = randy['requirement_type']
                req_count = randy['required_message_count'] or 0

                if req_type == 'post_randy':
                    current_count = 0
                    if existing:
                        current_count = existing['post_randy_message_count'] or 0

                    if current_count < req_count:
                        return False, f"post_randy:{req_count}:{current_count}"
                else:
                    met, current = await check_message_requirement(
                        user_id, randy['group_id'], req_type, req_count
                    )
                    if not met:
                        return False, f"mesaj_sarti:{req_type}:{req_count}:{current}"

            # Katılımcı ekle veya güncelle
            if existing:
                await conn.execute("""
                    UPDATE randy_participants
                    SET username = $1, first_name = $2
                    WHERE randy_id = $3 AND telegram_id = $4
                """, username, first_name, randy_id, user_id)
            else:
                await conn.execute("""
                    INSERT INTO randy_participants (randy_id, telegram_id, username, first_name)
                    VALUES ($1, $2, $3, $4)
                """, randy_id, user_id, username, first_name)

            return True, "basarili"
    except Exception as e:
        logger.error(f"❌ Randy katılım hatası: {e}")
        return False, "hata"


async def check_message_requirement(user_id: int, group_id: int, req_type: str, req_count: int) -> Tuple[bool, int]:
    """Mesaj şartını kontrol et"""
    try:
        async with db.pool.acquire() as conn:
            user = await conn.fetchrow("""
                SELECT daily_count, weekly_count, monthly_count, message_count
                FROM telegram_users
                WHERE telegram_id = $1 AND group_id = $2
            """, user_id, group_id)

            if not user:
                return False, 0

            if req_type == 'daily':
                current = user['daily_count'] or 0
            elif req_type == 'weekly':
                current = user['weekly_count'] or 0
            elif req_type == 'monthly':
                current = user['monthly_count'] or 0
            else:  # all_time
                current = user['message_count'] or 0

            return current >= req_count, current
    except Exception as e:
        logger.error(f"❌ Mesaj şartı kontrolü hatası: {e}")
        return False, 0


async def get_participant_count(randy_id: int) -> int:
    """Randy katılımcı sayısını getir"""
    try:
        async with db.pool.acquire() as conn:
            count = await conn.fetchval("""
                SELECT COUNT(*) FROM randy_participants
                WHERE randy_id = $1 AND (username IS NOT NULL OR first_name IS NOT NULL)
            """, randy_id)
            return count or 0
    except Exception as e:
        logger.error(f"❌ Katılımcı sayısı hatası: {e}")
        return 0


# ============================================
# RANDY SONLANDIRMA
# ============================================

async def end_randy(randy_id: int) -> Tuple[bool, List[Dict]]:
    """Randy'yi sonlandır ve kazananları seç"""
    try:
        randy = await get_randy_by_id(randy_id)

        if not randy:
            return False, []

        if randy['status'] != STATUS_ACTIVE:
            return False, []

        async with db.pool.acquire() as conn:
            participants = await conn.fetch("""
                SELECT telegram_id, username, first_name
                FROM randy_participants
                WHERE randy_id = $1 AND (username IS NOT NULL OR first_name IS NOT NULL)
            """, randy_id)

            participants = [dict(p) for p in participants]

            if len(participants) < randy['winner_count']:
                await conn.execute("""
                    UPDATE randy SET status = $1, ended_at = NOW() WHERE id = $2
                """, STATUS_ENDED, randy_id)
                return True, []

            winners = random.sample(participants, randy['winner_count'])

            for winner in winners:
                await conn.execute("""
                    INSERT INTO randy_winners (randy_id, telegram_id, username, first_name)
                    VALUES ($1, $2, $3, $4)
                """, randy_id, winner['telegram_id'], winner.get('username'), winner.get('first_name'))

            await conn.execute("""
                UPDATE randy SET status = $1, ended_at = NOW() WHERE id = $2
            """, STATUS_ENDED, randy_id)

            return True, winners
    except Exception as e:
        logger.error(f"❌ Randy sonlandırma hatası: {e}")
        return False, []


async def end_randy_with_count(randy_id: int, winner_count: int) -> Tuple[bool, List[Dict]]:
    """Randy'yi belirtilen kazanan sayısıyla sonlandır"""
    try:
        randy = await get_randy_by_id(randy_id)

        if not randy:
            return False, []

        if randy['status'] != STATUS_ACTIVE:
            return False, []

        async with db.pool.acquire() as conn:
            participants = await conn.fetch("""
                SELECT telegram_id, username, first_name
                FROM randy_participants
                WHERE randy_id = $1 AND (username IS NOT NULL OR first_name IS NOT NULL)
            """, randy_id)

            participants = [dict(p) for p in participants]

            await conn.execute("""
                UPDATE randy SET status = $1, ended_at = NOW() WHERE id = $2
            """, STATUS_ENDED, randy_id)

            if len(participants) == 0:
                return True, []

            actual_winner_count = min(winner_count, len(participants))
            winners = random.sample(participants, actual_winner_count)

            for winner in winners:
                await conn.execute("""
                    INSERT INTO randy_winners (randy_id, telegram_id, username, first_name)
                    VALUES ($1, $2, $3, $4)
                """, randy_id, winner['telegram_id'], winner.get('username'), winner.get('first_name'))

            return True, winners
    except Exception as e:
        logger.error(f"❌ Randy sonlandırma hatası (count): {e}")
        return False, []


# ============================================
# MESAJ TAKİBİ
# ============================================

async def track_post_randy_message(group_id: int, user_id: int) -> bool:
    """Randy sonrası mesaj takibi"""
    try:
        async with db.pool.acquire() as conn:
            randy = await conn.fetchrow("""
                SELECT id FROM randy
                WHERE group_id = $1 AND status = $2 AND requirement_type = 'post_randy'
            """, group_id, STATUS_ACTIVE)

            if not randy:
                return False

            existing = await conn.fetchrow("""
                SELECT id FROM randy_participants
                WHERE randy_id = $1 AND telegram_id = $2
            """, randy['id'], user_id)

            if existing:
                await conn.execute("""
                    UPDATE randy_participants
                    SET post_randy_message_count = post_randy_message_count + 1
                    WHERE randy_id = $1 AND telegram_id = $2
                """, randy['id'], user_id)
            else:
                await conn.execute("""
                    INSERT INTO randy_participants (randy_id, telegram_id, username, first_name, post_randy_message_count)
                    VALUES ($1, $2, NULL, NULL, 1)
                """, randy['id'], user_id)

            return True
    except Exception as e:
        logger.error(f"❌ Post-Randy mesaj takip hatası: {e}")
        return False


async def count_user_message(group_id: int, user_id: int, username: str = None, first_name: str = None) -> bool:
    """Kullanıcı mesajını say"""
    try:
        async with db.pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO telegram_users (telegram_id, group_id, username, first_name, message_count, daily_count, weekly_count, monthly_count, activity_count, last_message_at)
                VALUES ($1, $2, $3, $4, 1, 1, 1, 1, 1, NOW())
                ON CONFLICT (telegram_id, group_id)
                DO UPDATE SET
                    username = COALESCE($3, telegram_users.username),
                    first_name = COALESCE($4, telegram_users.first_name),
                    message_count = telegram_users.message_count + 1,
                    daily_count = telegram_users.daily_count + 1,
                    weekly_count = telegram_users.weekly_count + 1,
                    monthly_count = telegram_users.monthly_count + 1,
                    activity_count = telegram_users.activity_count + 1,
                    last_message_at = NOW(),
                    updated_at = NOW()
            """, user_id, group_id, username, first_name)
            return True
    except Exception as e:
        logger.error(f"❌ Mesaj sayma hatası: {e}")
        return False


# ============================================
# KULLANICI İSTATİSTİKLERİ
# ============================================

async def get_user_stats(user_id: int, group_id: int) -> Optional[Dict]:
    """Kullanıcı istatistiklerini getir"""
    try:
        async with db.pool.acquire() as conn:
            user = await conn.fetchrow("""
                SELECT * FROM telegram_users
                WHERE telegram_id = $1 AND group_id = $2
            """, user_id, group_id)

            if user:
                return dict(user)
            return None
    except Exception as e:
        logger.error(f"❌ Kullanıcı istatistikleri hatası: {e}")
        return None


async def get_full_user_stats(user_id: int, group_id: int) -> Optional[Dict]:
    """Kullanıcının tam istatistiklerini getir - sıralama dahil"""
    try:
        async with db.pool.acquire() as conn:
            # Kullanıcı bilgileri
            user = await conn.fetchrow("""
                SELECT * FROM telegram_users
                WHERE telegram_id = $1 AND group_id = $2
            """, user_id, group_id)

            if not user:
                return {
                    'daily': 0, 'weekly': 0, 'monthly': 0, 'total': 0,
                    'daily_rank': '-', 'weekly_rank': '-', 'monthly_rank': '-', 'activity_rank': '-',
                    'randy_participated': 0, 'randy_won': 0
                }

            # Günlük sıralama
            daily_rank = await conn.fetchval("""
                SELECT COUNT(*) + 1 FROM telegram_users
                WHERE group_id = $1 AND daily_count > $2
            """, group_id, user['daily_count'] or 0)

            # Haftalık sıralama
            weekly_rank = await conn.fetchval("""
                SELECT COUNT(*) + 1 FROM telegram_users
                WHERE group_id = $1 AND weekly_count > $2
            """, group_id, user['weekly_count'] or 0)

            # Aylık sıralama
            monthly_rank = await conn.fetchval("""
                SELECT COUNT(*) + 1 FROM telegram_users
                WHERE group_id = $1 AND monthly_count > $2
            """, group_id, user['monthly_count'] or 0)

            # Aktivite sıralama
            activity_rank = await conn.fetchval("""
                SELECT COUNT(*) + 1 FROM telegram_users
                WHERE group_id = $1 AND activity_count > $2
            """, group_id, user.get('activity_count', 0) or 0)

            # Randy katılım sayısı
            randy_participated = await conn.fetchval("""
                SELECT COUNT(*) FROM randy_participants rp
                JOIN randy r ON rp.randy_id = r.id
                WHERE rp.telegram_id = $1 AND r.group_id = $2
                AND (rp.username IS NOT NULL OR rp.first_name IS NOT NULL)
            """, user_id, group_id) or 0

            # Randy kazanma sayısı
            randy_won = await conn.fetchval("""
                SELECT COUNT(*) FROM randy_winners rw
                JOIN randy r ON rw.randy_id = r.id
                WHERE rw.telegram_id = $1 AND r.group_id = $2
            """, user_id, group_id) or 0

            return {
                'daily': user['daily_count'] or 0,
                'weekly': user['weekly_count'] or 0,
                'monthly': user['monthly_count'] or 0,
                'total': user['message_count'] or 0,
                'activity': user.get('activity_count', 0) or 0,
                'daily_rank': daily_rank,
                'weekly_rank': weekly_rank,
                'monthly_rank': monthly_rank,
                'activity_rank': activity_rank,
                'randy_participated': randy_participated,
                'randy_won': randy_won
            }
    except Exception as e:
        logger.error(f"❌ Tam kullanıcı istatistikleri hatası: {e}")
        return None


async def is_user_registered(user_id: int, group_id: int) -> bool:
    """Kullanıcı kayıtlı mı"""
    try:
        async with db.pool.acquire() as conn:
            result = await conn.fetchval("""
                SELECT 1 FROM telegram_users
                WHERE telegram_id = $1 AND group_id = $2
            """, user_id, group_id)
            return result is not None
    except Exception as e:
        logger.error(f"❌ Kullanıcı kayıt kontrolü hatası: {e}")
        return False
