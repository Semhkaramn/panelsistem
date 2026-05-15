"""
👮 Admin Kontrol Yardımcıları
"""

from telegram import Bot
from telegram.error import TelegramError
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
    """Kullanıcının chatte üye olup olmadığını kontrol et"""
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
    except TelegramError as e:
        logger.warning(f"Üyelik kontrol hatası: {e}")
        return False
