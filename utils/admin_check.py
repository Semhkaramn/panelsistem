"""
👮 Admin Kontrol Yardımcıları
"""

from telegram import Bot
from telegram.error import TelegramError, Forbidden, BadRequest
from config import ACTIVITY_GROUP_ID
import logging

logger = logging.getLogger(__name__)

# Cache için - 60 saniye geçerli
_member_cache = {}
_admin_cache = {}


def is_system_user(user_id: int) -> bool:
    """Sistem hesabı mı kontrol et"""
    system_ids = [
        777000,      # Telegram
        1087968824,  # GroupAnonymousBot
        136817688,   # Channel_Bot
    ]
    return user_id in system_ids


def can_anonymous_admin_use_commands(message) -> bool:
    """Anonim admin mi kontrol et"""
    if message.sender_chat and message.sender_chat.type in ['group', 'supergroup']:
        return True
    return False


async def is_group_admin(bot: Bot, group_id: int, user_id: int) -> bool:
    """Kullanıcının grupta admin olup olmadığını kontrol et"""
    try:
        member = await bot.get_chat_member(group_id, user_id)
        return member.status in ['creator', 'administrator']
    except TelegramError as e:
        logger.warning(f"Admin kontrol hatası: {e}")
        return False


async def is_activity_group_admin(bot: Bot, user_id: int) -> bool:
    """Ana grupta admin mi kontrol et"""
    if not ACTIVITY_GROUP_ID:
        return False

    return await is_group_admin(bot, ACTIVITY_GROUP_ID, user_id)


async def is_chat_member(bot: Bot, chat_id: int, user_id: int) -> bool:
    """
    Kullanıcının chatte üye olup olmadığını kontrol et

    NOT: "Member list is inaccessible" hatası alınırsa, bu genellikle:
    1. Bot'un grupta admin olmadığı anlamına gelir
    2. Grup gizlilik ayarlarından kaynaklanır

    Bu durumda True döndürüyoruz çünkü:
    - Kullanıcıyı yanlışlıkla engellemek istemiyoruz
    - Bot admin yapıldığında sorun çözülecek
    """
    import time

    cache_key = f"{chat_id}_{user_id}"
    current_time = time.time()

    # Cache kontrol (60 saniye)
    if cache_key in _member_cache:
        cached_time, cached_result = _member_cache[cache_key]
        if current_time - cached_time < 60:
            return cached_result

    try:
        member = await bot.get_chat_member(chat_id, user_id)
        is_member = member.status in ['creator', 'administrator', 'member', 'restricted']

        # Cache'e kaydet
        _member_cache[cache_key] = (current_time, is_member)

        return is_member

    except BadRequest as e:
        error_msg = str(e).lower()

        # "Member list is inaccessible" - Bot admin değil veya gizlilik ayarları
        if "member list is inaccessible" in error_msg:
            logger.debug(f"Üye listesi erişilemez (chat_id: {chat_id}) - Bot'u admin yapın!")
            # Kullanıcıyı engellememek için True döndür
            _member_cache[cache_key] = (current_time, True)
            return True

        # "User not found" - Kullanıcı grupta değil
        elif "user not found" in error_msg:
            _member_cache[cache_key] = (current_time, False)
            return False

        else:
            logger.warning(f"Üyelik kontrol hatası (BadRequest): {e}")
            return True  # Şüpheli durumda True döndür

    except Forbidden as e:
        # Bot gruptan atılmış veya erişim yok
        logger.warning(f"Erişim reddedildi (chat_id: {chat_id}): {e}")
        return True  # Kullanıcıyı engelleme

    except TelegramError as e:
        logger.warning(f"Üyelik kontrol hatası: {e}")
        # Hata durumunda kullanıcıyı engellememek için True döndür
        return True


async def check_bot_admin_status(bot: Bot, chat_id: int) -> bool:
    """
    Bot'un grupta admin olup olmadığını kontrol et
    Bu fonksiyonu grup komutlarında kullanarak kullanıcıya bilgi verebilirsiniz
    """
    try:
        bot_member = await bot.get_chat_member(chat_id, bot.id)
        return bot_member.status in ['administrator']
    except TelegramError:
        return False


def clear_member_cache(chat_id: int = None, user_id: int = None):
    """
    Üyelik cache'ini temizle
    - chat_id ve user_id verilirse sadece o kullanıcıyı temizle
    - Sadece chat_id verilirse o grubun tüm cache'ini temizle
    - Hiçbiri verilmezse tüm cache'i temizle
    """
    global _member_cache

    if chat_id is None and user_id is None:
        _member_cache = {}
    elif user_id is None:
        # Belirli bir grubun tüm cache'ini temizle
        keys_to_remove = [k for k in _member_cache if k.startswith(f"{chat_id}_")]
        for key in keys_to_remove:
            del _member_cache[key]
    else:
        # Belirli kullanıcıyı temizle
        cache_key = f"{chat_id}_{user_id}"
        if cache_key in _member_cache:
            del _member_cache[cache_key]
