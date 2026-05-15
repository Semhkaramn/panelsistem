"""
🤖 Randy Bot - Panel Sistemi
Ana giriş noktası

Komutlar:
- /start - Bot başlat (özel: menü, grup: kayıt)
- /randy - Randy başlat (grupta)
- /bitir - Randy bitir (grupta - admin)
- /number X - Kazanan sayısı değiştir (grupta - admin)
- .ben, !ben, /ben - İstatistikler (grup)
"""

import asyncio
import logging
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    filters,
)

from config import BOT_TOKEN
from database import db
from handlers.callbacks import handle_callback
from handlers.messages import handle_message

# Logging ayarları
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Gereksiz logları kapat
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("telegram.ext").setLevel(logging.WARNING)


async def post_init(application) -> None:
    """Bot başladığında veritabanı bağlantısını kur"""
    await db.connect()
    logger.info("✅ Bot başlatıldı!")


async def post_shutdown(application) -> None:
    """Bot kapanırken veritabanı bağlantısını kapat"""
    await db.close()
    logger.info("🔌 Bot kapatıldı")


# ============================================
# KOMUTLAR
# ============================================

async def start_command(update: Update, context):
    """
    /start komutu
    - Özel mesajda: Ana menüyü göster (sadece adminler)
    - Grupta: Grubu kaydet
    """
    from handlers.callbacks import show_main_menu_message
    from services.randy_service import register_group, update_group_admin
    from utils.admin_check import is_group_admin, is_activity_group_admin
    from config import ACTIVITY_GROUP_ID

    chat = update.effective_chat
    user = update.effective_user
    message = update.effective_message

    if not user:
        return

    # Grupta /start
    if chat.type in ['group', 'supergroup']:
        await register_group(chat.id, chat.title or "")

        try:
            is_admin = await is_group_admin(context.bot, chat.id, user.id)
            await update_group_admin(chat.id, user.id, is_admin)
        except:
            pass
        return

    # Özel mesajda /start - parametreleri kontrol et
    if context.args and len(context.args) > 0:
        arg = context.args[0]

        if arg.startswith("stats_"):
            # İstatistik isteği
            from services.randy_service import get_full_user_stats
            from templates import STATS

            try:
                group_id = int(arg.replace("stats_", ""))
            except ValueError:
                group_id = ACTIVITY_GROUP_ID

            if group_id:
                stats = await get_full_user_stats(user.id, group_id)

                if stats:
                    username_line = f"• @{user.username}" if user.username else ""

                    if stats.get('randy_participated', 0) > 0:
                        win_rate = (stats.get('randy_won', 0) / stats['randy_participated']) * 100
                        win_rate_line = f"    Oran  ➜  <b>%{win_rate:.1f}</b>"
                    else:
                        win_rate_line = ""

                    text = STATS["USER_CARD"].format(
                        name=user.first_name or "Kullanıcı",
                        username_line=username_line,
                        daily=stats.get('daily', 0),
                        weekly=stats.get('weekly', 0),
                        monthly=stats.get('monthly', 0),
                        total=stats.get('total', 0),
                        randy_participated=stats.get('randy_participated', 0),
                        randy_won=stats.get('randy_won', 0),
                        win_rate_line=win_rate_line,
                        daily_rank=stats.get('daily_rank', '-'),
                        weekly_rank=stats.get('weekly_rank', '-'),
                        monthly_rank=stats.get('monthly_rank', '-'),
                    )
                else:
                    text = STATS["KAYIT_YOK"]

                await message.reply_text(text, parse_mode="HTML")
                return

    # Özel mesajda /start - Önce admin kontrolü
    is_admin = await is_activity_group_admin(context.bot, user.id)

    if not is_admin:
        await message.reply_text(
            "❌ <b>Erişim Engellendi</b>\n\n"
            "Bu botu kullanmak için ana gruptaki admin olmanız gerekiyor.\n\n"
            "💡 <i>Eğer admin olduğunuzu düşünüyorsanız, önce grupta /start yazarak kendinizi kaydedin.</i>",
            parse_mode="HTML"
        )
        return

    # Admin ise ANA MENÜ göster
    await show_main_menu_message(message, context)


async def randy_command(update: Update, context):
    """
    /randy komutu - Grupta Randy başlat
    """
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup, LinkPreviewOptions
    from telegram.error import TelegramError
    from services.randy_service import (
        get_active_randy, start_randy, get_group_draft,
        get_randy_channels, update_randy_message_id,
        get_randy_by_message_id, end_randy_with_count, get_participant_count,
        get_or_create_group_draft, is_randy_enabled_for_channel
    )
    from templates import RANDY, format_winner_list, get_period_text
    from utils.admin_check import is_group_admin, can_anonymous_admin_use_commands
    from config import ACTIVITY_GROUP_ID

    DISABLE_PREVIEW = LinkPreviewOptions(is_disabled=True)

    chat = update.effective_chat
    user = update.effective_user
    message = update.effective_message

    if not user or not message:
        return

    # Özel mesajda çalışmaz
    if chat.type == 'private':
        return

    # Grupta /randy
    if chat.type in ['group', 'supergroup']:
        # Admin kontrolü
        if can_anonymous_admin_use_commands(message):
            is_admin = True
        else:
            is_admin = await is_group_admin(context.bot, chat.id, user.id)

        if not is_admin:
            return

        # Komutu sil
        try:
            await message.delete()
        except TelegramError:
            pass

        # Reply ile Randy bitirme kontrolü
        if message.reply_to_message:
            randy = await get_randy_by_message_id(chat.id, message.reply_to_message.message_id)

            if randy and randy['status'] == 'active':
                # Randy'yi bitir
                participant_count = await get_participant_count(randy['id'])
                winner_count = randy['winner_count']

                success, winners = await end_randy_with_count(randy['id'], winner_count)

                if success:
                    if not winners:
                        text = RANDY["KAZANAN_YOK"]
                    else:
                        winner_list = format_winner_list(winners)

                        if participant_count < winner_count:
                            text = RANDY["BITTI_KATILIMCI_AZ"].format(
                                participants=participant_count,
                                winner_count=winner_count,
                                winner_list=winner_list
                            )
                        else:
                            text = RANDY["BITTI"].format(
                                participants=participant_count,
                                winner_list=winner_list
                            )

                    try:
                        if randy.get('media_file_id') and randy.get('media_type') != 'none':
                            await context.bot.edit_message_caption(
                                chat_id=chat.id,
                                message_id=randy['message_id'],
                                caption=text,
                                reply_markup=None,
                                parse_mode="HTML"
                            )
                        else:
                            await context.bot.edit_message_text(
                                chat_id=chat.id,
                                message_id=randy['message_id'],
                                text=text,
                                reply_markup=None,
                                parse_mode="HTML"
                            )
                    except TelegramError:
                        await context.bot.send_message(chat.id, text, parse_mode="HTML")
                return

        # Kanal kontrolü - bu kanalda açılabilir mi?
        is_enabled, no_requirement = await is_randy_enabled_for_channel(ACTIVITY_GROUP_ID or chat.id, chat.id)

        if not is_enabled:
            info_msg = await context.bot.send_message(
                chat.id,
                RANDY["DEVRE_DISI"],
                parse_mode="HTML"
            )
            await asyncio.sleep(5)
            try:
                await info_msg.delete()
            except TelegramError:
                pass
            return

        # Grup ayarlarını kontrol et
        draft = await get_group_draft(chat.id)

        if not draft and ACTIVITY_GROUP_ID:
            draft = await get_group_draft(ACTIVITY_GROUP_ID)

        has_content = draft and (draft.get('message') or (draft.get('media_file_id') and draft.get('media_type') != 'none'))

        if not has_content:
            info_msg = await context.bot.send_message(
                chat.id,
                "❌ Randy ayarları yapılmamış.\n\nÖnce özelden /start ile mesaj ayarlayın.",
                parse_mode="HTML"
            )
            await asyncio.sleep(5)
            try:
                await info_msg.delete()
            except TelegramError:
                pass
            return

        # Randy başlat
        success, randy_data = await start_randy(chat.id, user.id, opened_in_channel_id=chat.id)

        if not success:
            if randy_data and randy_data.get("error") == "already_active":
                info_msg = await context.bot.send_message(
                    chat.id,
                    "⚠️ Bu grupta zaten aktif bir Randy var.",
                    parse_mode="HTML"
                )
                await asyncio.sleep(5)
                try:
                    await info_msg.delete()
                except TelegramError:
                    pass
            elif randy_data and randy_data.get("error") == "channel_disabled":
                info_msg = await context.bot.send_message(
                    chat.id,
                    RANDY["DEVRE_DISI"],
                    parse_mode="HTML"
                )
                await asyncio.sleep(5)
                try:
                    await info_msg.delete()
                except TelegramError:
                    pass
            return

        # Randy mesajını oluştur
        channels_list = []

        # Activity group'u ekle
        if ACTIVITY_GROUP_ID:
            try:
                activity_chat = await context.bot.get_chat(ACTIVITY_GROUP_ID)
                if activity_chat.username:
                    channels_list.append(f'<a href="https://t.me/{activity_chat.username}">{activity_chat.title or activity_chat.username}</a>')
                elif activity_chat.title:
                    channels_list.append(activity_chat.title)
            except TelegramError:
                pass

        # Zorunlu kanalları ekle
        randy_channels = await get_randy_channels(randy_data['id'])
        for ch in randy_channels:
            if ch.get('channel_username'):
                title = ch.get('channel_title') or ch['channel_username']
                channels_list.append(f'<a href="https://t.me/{ch["channel_username"]}">{title}</a>')
            elif ch.get('channel_title'):
                channels_list.append(ch['channel_title'])

        if channels_list:
            channels_text = "📢 <b>Zorunlu:</b>\n" + "\n".join(channels_list) + "\n\n"
        else:
            channels_text = ""

        # Şart varsa şartlı template kullan
        req_type = randy_data.get('requirement_type', 'none')
        req_count = randy_data.get('required_message_count', 0)

        if req_type != 'none' and req_count > 0:
            period_text = get_period_text(req_type)
            requirement = f"{period_text} {req_count} mesaj"
            text = RANDY["BASLADI_SARTLI"].format(
                message=randy_data['message'],
                requirement=requirement,
                channels_text=channels_text,
                participants=0,
                winners=randy_data['winner_count']
            )
        else:
            text = RANDY["BASLADI"].format(
                message=randy_data['message'],
                channels_text=channels_text,
                participants=0,
                winners=randy_data['winner_count']
            )

        keyboard = [[
            InlineKeyboardButton(
                "🎉 Katıl (0)",
                callback_data=f"randy_join_{randy_data['id']}"
            )
        ]]

        # Medya varsa medyalı gönder
        if randy_data.get('media_file_id') and randy_data.get('media_type') != 'none':
            media_type = randy_data['media_type']
            file_id = randy_data['media_file_id']

            try:
                if media_type == 'photo':
                    sent_msg = await context.bot.send_photo(
                        chat.id,
                        photo=file_id,
                        caption=text,
                        reply_markup=InlineKeyboardMarkup(keyboard),
                        parse_mode="HTML"
                    )
                elif media_type == 'video':
                    sent_msg = await context.bot.send_video(
                        chat.id,
                        video=file_id,
                        caption=text,
                        reply_markup=InlineKeyboardMarkup(keyboard),
                        parse_mode="HTML"
                    )
                elif media_type == 'animation':
                    sent_msg = await context.bot.send_animation(
                        chat.id,
                        animation=file_id,
                        caption=text,
                        reply_markup=InlineKeyboardMarkup(keyboard),
                        parse_mode="HTML"
                    )
                else:
                    sent_msg = await context.bot.send_message(
                        chat.id,
                        text,
                        reply_markup=InlineKeyboardMarkup(keyboard),
                        parse_mode="HTML",
                        link_preview_options=DISABLE_PREVIEW
                    )
            except TelegramError:
                sent_msg = await context.bot.send_message(
                    chat.id,
                    text,
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode="HTML",
                    link_preview_options=DISABLE_PREVIEW
                )
        else:
            sent_msg = await context.bot.send_message(
                chat.id,
                text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode="HTML",
                link_preview_options=DISABLE_PREVIEW
            )

        # Mesaj ID'sini kaydet
        await update_randy_message_id(randy_data['id'], sent_msg.message_id)

        # Sabitleme
        if randy_data.get('pin_message'):
            try:
                await context.bot.pin_chat_message(
                    chat.id,
                    sent_msg.message_id,
                    disable_notification=True
                )
            except TelegramError:
                pass


async def bitir_command(update: Update, context):
    """
    /bitir komutu - Aktif Randy'yi bitirir
    """
    from telegram.error import TelegramError
    from services.randy_service import (
        get_active_randy, get_randy_by_message_id,
        end_randy_with_count, get_participant_count
    )
    from templates import RANDY, format_winner_list
    from utils.admin_check import is_group_admin, can_anonymous_admin_use_commands
    from config import ACTIVITY_GROUP_ID

    chat = update.effective_chat
    user = update.effective_user
    message = update.effective_message

    if not user or not message:
        return

    if chat.type not in ['group', 'supergroup']:
        return

    # Admin kontrolü
    if can_anonymous_admin_use_commands(message):
        is_admin = True
    else:
        is_admin = await is_group_admin(context.bot, chat.id, user.id)

    if not is_admin:
        return

    # Komutu sil
    try:
        await message.delete()
    except TelegramError:
        pass

    # Reply ile Randy bitirme
    randy = None
    if message.reply_to_message:
        randy = await get_randy_by_message_id(chat.id, message.reply_to_message.message_id)

    if not randy:
        randy = await get_active_randy(chat.id)

    if not randy:
        info_msg = await context.bot.send_message(
            chat.id,
            "❌ Bu grupta aktif Randy yok.",
            parse_mode="HTML"
        )
        await asyncio.sleep(3)
        try:
            await info_msg.delete()
        except TelegramError:
            pass
        return

    if randy['status'] != 'active':
        info_msg = await context.bot.send_message(
            chat.id,
            "⚠️ Bu Randy zaten bitmiş.",
            parse_mode="HTML"
        )
        await asyncio.sleep(3)
        try:
            await info_msg.delete()
        except TelegramError:
            pass
        return

    # Randy'yi bitir
    participant_count = await get_participant_count(randy['id'])
    winner_count = randy['winner_count']

    success, winners = await end_randy_with_count(randy['id'], winner_count)

    if not success:
        return

    if not winners:
        text = RANDY["KAZANAN_YOK"]
    else:
        winner_list = format_winner_list(winners)

        if participant_count < winner_count:
            text = RANDY["BITTI_KATILIMCI_AZ"].format(
                participants=participant_count,
                winner_count=winner_count,
                winner_list=winner_list
            )
        else:
            text = RANDY["BITTI"].format(
                participants=participant_count,
                winner_list=winner_list
            )

    try:
        if randy.get('media_file_id') and randy.get('media_type') != 'none':
            await context.bot.edit_message_caption(
                chat_id=chat.id,
                message_id=randy['message_id'],
                caption=text,
                reply_markup=None,
                parse_mode="HTML"
            )
        else:
            await context.bot.edit_message_text(
                chat_id=chat.id,
                message_id=randy['message_id'],
                text=text,
                reply_markup=None,
                parse_mode="HTML"
            )
    except TelegramError:
        await context.bot.send_message(chat.id, text, parse_mode="HTML")


async def number_command(update: Update, context):
    """
    /number X komutu - Kazanan sayısını değiştir
    """
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup, LinkPreviewOptions
    from telegram.error import TelegramError
    from services.randy_service import (
        get_active_randy, update_randy_winner_count,
        update_draft_winner_count, get_participant_count,
        get_randy_channels, get_or_create_group_draft
    )
    from templates import RANDY, get_period_text
    from utils.admin_check import is_group_admin, can_anonymous_admin_use_commands
    from config import ACTIVITY_GROUP_ID

    DISABLE_PREVIEW = LinkPreviewOptions(is_disabled=True)

    chat = update.effective_chat
    user = update.effective_user
    message = update.effective_message

    if not user or not message:
        return

    if chat.type not in ['group', 'supergroup']:
        return

    # Admin kontrolü
    if can_anonymous_admin_use_commands(message):
        is_admin = True
    else:
        is_admin = await is_group_admin(context.bot, chat.id, user.id)

    if not is_admin:
        return

    # Komutu sil
    try:
        await message.delete()
    except TelegramError:
        pass

    # Argüman kontrolü
    if not context.args or len(context.args) < 1:
        info_msg = await context.bot.send_message(
            chat.id,
            "❌ Kullanım: /number X\n\nÖrnek: /number 4",
            parse_mode="HTML"
        )
        await asyncio.sleep(5)
        try:
            await info_msg.delete()
        except TelegramError:
            pass
        return

    try:
        winner_count = int(context.args[0])
        if winner_count < 1:
            raise ValueError()
    except ValueError:
        info_msg = await context.bot.send_message(
            chat.id,
            "❌ Geçerli bir sayı girin.",
            parse_mode="HTML"
        )
        await asyncio.sleep(5)
        try:
            await info_msg.delete()
        except TelegramError:
            pass
        return

    # Aktif Randy var mı?
    randy = await get_active_randy(chat.id)

    if not randy:
        # Aktif Randy yok - sadece taslağı güncelle
        await get_or_create_group_draft(user.id, chat.id)
        await update_draft_winner_count(chat.id, winner_count)

        info_msg = await context.bot.send_message(
            chat.id,
            f"✅ Kazanan sayısı <b>{winner_count}</b> olarak ayarlandı.",
            parse_mode="HTML"
        )
        await asyncio.sleep(5)
        try:
            await info_msg.delete()
        except TelegramError:
            pass
        return

    # Randy'nin kazanan sayısını güncelle
    await update_randy_winner_count(randy['id'], winner_count)
    await update_draft_winner_count(chat.id, winner_count)

    # Katılımcı sayısını al
    participant_count = await get_participant_count(randy['id'])

    # Randy mesajını güncelle
    channels_list = []

    if ACTIVITY_GROUP_ID:
        try:
            activity_chat = await context.bot.get_chat(ACTIVITY_GROUP_ID)
            if activity_chat.username:
                channels_list.append(f'<a href="https://t.me/{activity_chat.username}">{activity_chat.title or activity_chat.username}</a>')
            elif activity_chat.title:
                channels_list.append(activity_chat.title)
        except TelegramError:
            pass

    randy_channels = await get_randy_channels(randy['id'])
    for ch in randy_channels:
        if ch.get('channel_username'):
            title = ch.get('channel_title') or ch['channel_username']
            channels_list.append(f'<a href="https://t.me/{ch["channel_username"]}">{title}</a>')
        elif ch.get('channel_title'):
            channels_list.append(ch['channel_title'])

    if channels_list:
        channels_text = "📢 <b>Zorunlu:</b>\n" + "\n".join(channels_list) + "\n\n"
    else:
        channels_text = ""

    req_type = randy.get('requirement_type', 'none')
    req_count = randy.get('required_message_count', 0)

    if req_type != 'none' and req_count > 0:
        period_text = get_period_text(req_type)
        requirement = f"{period_text} {req_count} mesaj"
        text = RANDY["BASLADI_SARTLI"].format(
            message=randy['message'],
            requirement=requirement,
            channels_text=channels_text,
            participants=participant_count,
            winners=winner_count
        )
    else:
        text = RANDY["BASLADI"].format(
            message=randy['message'],
            channels_text=channels_text,
            participants=participant_count,
            winners=winner_count
        )

    keyboard = [[
        InlineKeyboardButton(
            f"🎉 Katıl ({participant_count})",
            callback_data=f"randy_join_{randy['id']}"
        )
    ]]

    try:
        try:
            await context.bot.edit_message_text(
                chat_id=chat.id,
                message_id=randy['message_id'],
                text=text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode="HTML",
                link_preview_options=DISABLE_PREVIEW
            )
        except TelegramError as text_err:
            if "no text" in str(text_err).lower():
                await context.bot.edit_message_caption(
                    chat_id=chat.id,
                    message_id=randy['message_id'],
                    caption=text,
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode="HTML"
                )
            else:
                raise text_err

        info_msg = await context.bot.send_message(
            chat.id,
            f"✅ Kazanan sayısı <b>{winner_count}</b> olarak güncellendi.",
            parse_mode="HTML"
        )
        await asyncio.sleep(5)
        try:
            await info_msg.delete()
        except TelegramError:
            pass
    except TelegramError as e:
        logger.error(f"❌ Randy mesajı güncelleme hatası: {e}")


async def ben_command(update: Update, context):
    """
    .ben, !ben, /ben komutu - Kullanıcının istatistik kartını gösterir
    """
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup
    from telegram.error import TelegramError
    from services.randy_service import get_full_user_stats
    from templates import STATS
    from utils.admin_check import is_system_user
    from config import ACTIVITY_GROUP_ID, BOT_USERNAME

    chat = update.effective_chat
    user = update.effective_user
    message = update.effective_message

    if not user or not message:
        return

    if chat.type not in ['group', 'supergroup']:
        return

    # Sadece ACTIVITY_GROUP_ID'de çalış
    if ACTIVITY_GROUP_ID and chat.id != ACTIVITY_GROUP_ID:
        return

    # Sistem hesapları için çalışmaz
    if is_system_user(user.id):
        return

    # Anonim admin kontrolü
    if message.sender_chat:
        await message.reply_text(
            "👤 <b>Anonim Admin</b>\n\n"
            "Anonim olarak mesaj gönderdiğiniz için istatistiklerinizi göremiyorum.\n\n"
            "💡 İstatistiklerinizi görmek için kendi hesabınızdan bu komutu kullanın.",
            parse_mode="HTML"
        )
        return

    # Kullanıcı adını al
    display_name = f"@{user.username}" if user.username else user.first_name
    mention = f'<a href="tg://user?id={user.id}">{display_name}</a>'

    # Bot username'ini al
    bot_username = BOT_USERNAME or (await context.bot.get_me()).username

    # Kullanıcı botu başlatmış mı kontrol et - özelden mesaj gönder
    bot_started = False
    try:
        # Özelden istatistik göndermeyi dene
        stats = await get_full_user_stats(user.id, chat.id)

        if stats:
            username_line = f"• @{user.username}" if user.username else ""

            if stats.get('randy_participated', 0) > 0:
                win_rate = (stats.get('randy_won', 0) / stats['randy_participated']) * 100
                win_rate_line = f"    Oran  ➜  <b>%{win_rate:.1f}</b>"
            else:
                win_rate_line = ""

            stats_text = STATS["USER_CARD"].format(
                name=user.first_name or "Kullanıcı",
                username_line=username_line,
                daily=stats.get('daily', 0),
                weekly=stats.get('weekly', 0),
                monthly=stats.get('monthly', 0),
                total=stats.get('total', 0),
                randy_participated=stats.get('randy_participated', 0),
                randy_won=stats.get('randy_won', 0),
                win_rate_line=win_rate_line,
                daily_rank=stats.get('daily_rank', '-'),
                weekly_rank=stats.get('weekly_rank', '-'),
                monthly_rank=stats.get('monthly_rank', '-'),
            )
        else:
            stats_text = STATS["KAYIT_YOK"]

        # Özelden mesaj göndermeyi dene
        await context.bot.send_message(
            chat_id=user.id,
            text=stats_text,
            parse_mode="HTML"
        )
        bot_started = True

    except TelegramError:
        # Bot başlatılmamış
        bot_started = False

    if bot_started:
        # Bot başlatılmış - grupta "Özelden gönderildi" yaz
        await message.reply_text(
            f"👋 {mention}\n"
            f'📨 <a href="https://t.me/{bot_username}">Özelden gönderildi</a>',
            parse_mode="HTML",
            disable_web_page_preview=True
        )
    else:
        # Bot başlatılmamış - sadece tek buton göster
        keyboard = [[
            InlineKeyboardButton(
                "📊 İstatistikler için buraya bas",
                callback_data=f"check_started_{user.id}"
            )
        ]]

        await message.reply_text(
            f"👋 {mention}",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode="HTML"
        )


def main():
    """Bot'u başlat"""
    if not BOT_TOKEN:
        logger.error("❌ BOT_TOKEN bulunamadı! .env dosyasını kontrol edin.")
        return

    # Application oluştur
    application = (
        Application.builder()
        .token(BOT_TOKEN)
        .post_init(post_init)
        .post_shutdown(post_shutdown)
        .build()
    )

    # ========== KOMUT HANDLER'LARI ==========
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("randy", randy_command))
    application.add_handler(CommandHandler("bitir", bitir_command))
    application.add_handler(CommandHandler("number", number_command))

    # .ben, !ben, /ben
    application.add_handler(CommandHandler("ben", ben_command))
    application.add_handler(MessageHandler(
        filters.Regex(r'^[.!]ben$') & filters.ChatType.GROUPS,
        ben_command
    ))

    # ========== CALLBACK HANDLER ==========
    application.add_handler(CallbackQueryHandler(handle_callback))

    # ========== MESAJ HANDLER ==========
    application.add_handler(MessageHandler(
        (filters.TEXT | filters.PHOTO | filters.VIDEO | filters.ANIMATION) & ~filters.COMMAND,
        handle_message
    ))

    # Bot'u çalıştır
    logger.info("🚀 Bot başlatılıyor...")
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
