"""
📨 Mesaj Handler
Mesaj sayma, Randy ayarları için input işleme
"""

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes
from telegram.error import TelegramError
import logging

logger = logging.getLogger(__name__)

from services.randy_service import (
    update_draft, get_draft, count_user_message,
    track_post_randy_message, add_channel_to_draft,
    add_allowed_channel, get_draft_channels, get_allowed_channels
)
from templates import BUTTONS
from utils.admin_check import is_system_user
from config import ACTIVITY_GROUP_ID


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Ana mesaj handler"""
    chat = update.effective_chat
    user = update.effective_user
    message = update.effective_message

    if not user or not message:
        return

    # Sistem hesapları için çalışmaz
    if is_system_user(user.id):
        return

    # ========== ÖZEL MESAJ ==========
    if chat.type == 'private':
        await _handle_private_message(update, context)
        return

    # ========== GRUP MESAJI ==========
    if chat.type in ['group', 'supergroup']:
        # Anonim mesajlar sayılmaz
        if message.sender_chat:
            return

        await _handle_group_message(update, context)
        return


async def _handle_private_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Özel mesaj işleme - Randy ayarları için"""
    user = update.effective_user
    message = update.effective_message
    waiting_for = context.user_data.get('waiting_for')

    if not waiting_for:
        return

    group_id = context.user_data.get('active_group_id')
    menu_message_id = context.user_data.get('menu_message_id')

    # Randy mesajı
    if waiting_for == 'randy_message':
        msg_text = message.text or message.caption

        if msg_text:
            await update_draft(user.id, group_id=group_id, message=msg_text)

            # Menüyü güncelle
            context.user_data.pop('waiting_for', None)
            await _show_randy_settings_updated(context.bot, user.id, menu_message_id, group_id, "✅ Mesaj kaydedildi!")

    # Mesaj sayısı
    elif waiting_for == 'randy_msg_count':
        try:
            count = int(message.text)
            if count < 1:
                raise ValueError()

            await update_draft(user.id, group_id=group_id, required_message_count=count)

            context.user_data.pop('waiting_for', None)
            await _show_randy_settings_updated(context.bot, user.id, menu_message_id, group_id, f"✅ Mesaj şartı: {count}")
        except ValueError:
            await message.reply_text("❌ Geçerli bir sayı girin (en az 1)")

    # Kazanan sayısı
    elif waiting_for == 'randy_winner_count':
        try:
            count = int(message.text)
            if count < 1:
                raise ValueError()

            await update_draft(user.id, group_id=group_id, winner_count=count)

            context.user_data.pop('waiting_for', None)
            await _show_randy_settings_updated(context.bot, user.id, menu_message_id, group_id, f"✅ Kazanan sayısı: {count}")
        except ValueError:
            await message.reply_text("❌ Geçerli bir sayı girin (en az 1)")

    # Medya
    elif waiting_for == 'randy_media':
        media_type = None
        file_id = None

        if message.photo:
            media_type = 'photo'
            file_id = message.photo[-1].file_id
        elif message.video:
            media_type = 'video'
            file_id = message.video.file_id
        elif message.animation:
            media_type = 'animation'
            file_id = message.animation.file_id

        if media_type and file_id:
            await update_draft(user.id, group_id=group_id, media_type=media_type, media_file_id=file_id)

            context.user_data.pop('waiting_for', None)
            await _show_randy_settings_updated(context.bot, user.id, menu_message_id, group_id, "✅ Medya kaydedildi!")
        else:
            await message.reply_text("❌ Fotoğraf, video veya GIF gönderin")

    # Zorunlu kanal ekleme
    elif waiting_for == 'randy_channels':
        text = message.text

        if text:
            # @username veya ID olabilir
            try:
                if text.startswith('@'):
                    # Username ile
                    channel_username = text.lstrip('@')
                    try:
                        chat_info = await context.bot.get_chat(f"@{channel_username}")
                        channel_id = chat_info.id
                        channel_title = chat_info.title
                    except TelegramError:
                        await message.reply_text("❌ Kanal bulunamadı. Bot kanalda admin olmalı.")
                        return
                else:
                    # ID ile
                    channel_id = int(text)
                    try:
                        chat_info = await context.bot.get_chat(channel_id)
                        channel_username = chat_info.username
                        channel_title = chat_info.title
                    except TelegramError:
                        await message.reply_text("❌ Kanal bulunamadı. Bot kanalda admin olmalı.")
                        return

                success, msg = await add_channel_to_draft(
                    user.id, channel_id, channel_username, channel_title, group_id
                )

                if success:
                    await _show_channels_menu_updated(context.bot, user.id, menu_message_id, group_id)
                else:
                    await message.reply_text(f"❌ {msg}")

            except (ValueError, TelegramError) as e:
                await message.reply_text("❌ Geçerli bir @username veya ID girin")

    # Açılacak kanal ekleme
    elif waiting_for == 'randy_allowed_channel':
        text = message.text
        draft = await get_draft(user.id, group_id)

        if text and draft:
            try:
                if text.startswith('@'):
                    channel_username = text.lstrip('@')
                    try:
                        chat_info = await context.bot.get_chat(f"@{channel_username}")
                        channel_id = chat_info.id
                        channel_title = chat_info.title
                    except TelegramError:
                        await message.reply_text("❌ Kanal bulunamadı. Bot kanalda admin olmalı.")
                        return
                else:
                    channel_id = int(text)
                    try:
                        chat_info = await context.bot.get_chat(channel_id)
                        channel_username = chat_info.username
                        channel_title = chat_info.title
                    except TelegramError:
                        await message.reply_text("❌ Kanal bulunamadı. Bot kanalda admin olmalı.")
                        return

                success, msg = await add_allowed_channel(
                    draft['id'], channel_id, channel_title, channel_username
                )

                if success:
                    context.user_data.pop('waiting_for', None)
                    await _show_allowed_channels_updated(context.bot, user.id, menu_message_id, group_id, draft['id'])
                else:
                    await message.reply_text(f"❌ {msg}")

            except (ValueError, TelegramError) as e:
                await message.reply_text("❌ Geçerli bir @username veya ID girin")


async def _handle_group_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Grup mesajı işleme - Mesaj sayma"""
    chat = update.effective_chat
    user = update.effective_user
    message = update.effective_message

    # Sadece ACTIVITY_GROUP_ID'de mesaj say (tanımlıysa)
    if ACTIVITY_GROUP_ID and chat.id != ACTIVITY_GROUP_ID:
        return

    # Mesajı say
    await count_user_message(
        chat.id,
        user.id,
        user.username,
        user.first_name
    )

    # Post-Randy mesaj takibi
    await track_post_randy_message(chat.id, user.id)


async def _show_randy_settings_updated(bot, user_id: int, message_id: int, group_id: int, info: str):
    """Randy ayarları menüsünü güncelle"""
    from handlers.callbacks import show_randy_settings_menu
    from templates import MENU, BUTTONS, get_period_text, get_media_type_text

    try:
        draft = await get_draft(user_id, group_id)
        if not draft:
            return

        channels = await get_draft_channels(user_id, group_id)
        allowed_channels = await get_allowed_channels(draft['id'])

        message_status = "✅" if draft.get('message') else "❌"

        req_type = draft.get('requirement_type', 'none')
        req_count = draft.get('required_message_count', 0)
        if req_type != 'none' and req_count > 0:
            period_text = get_period_text(req_type)
            req_status = f"✅ ({period_text} {req_count})"
        else:
            req_status = "➖"

        winner_count = draft.get('winner_count', 1)
        winner_status = f"({winner_count})"

        media_type = draft.get('media_type', 'none')
        media_status = "✅" if media_type != 'none' and draft.get('media_file_id') else "➖"

        pin_status = "✅" if draft.get('pin_message') else "❌"
        channel_status = f"✅ ({len(channels)})" if channels else "➖"
        allowed_status = f"✅ ({len(allowed_channels)})" if allowed_channels else "➖"
        admin_join_status = "✅" if draft.get('admin_can_join') else "❌"

        keyboard = [
            [InlineKeyboardButton(f"{message_status} {BUTTONS['MESAJ_AYARLA']}", callback_data="randy_message")],
            [InlineKeyboardButton(f"{req_status} {BUTTONS['SART_AYARLA']}", callback_data="randy_requirement")],
            [InlineKeyboardButton(f"{BUTTONS['KAZANAN_AYARLA']} {winner_status}", callback_data="randy_winners")],
            [InlineKeyboardButton(f"{media_status} {BUTTONS['MEDYA_EKLE']}", callback_data="randy_media")],
            [InlineKeyboardButton(f"{channel_status} {BUTTONS['KANAL_EKLE']}", callback_data="randy_channels")],
            [InlineKeyboardButton(f"{allowed_status} {BUTTONS['ACILACAK_KANALLAR']}", callback_data="randy_allowed_channels")],
            [InlineKeyboardButton(f"{pin_status} {BUTTONS['SABITLE']}", callback_data="randy_pin")],
            [InlineKeyboardButton(f"{admin_join_status} Admin Katılabilir", callback_data="randy_admin_join")],
            [InlineKeyboardButton(BUTTONS["ONIZLE"], callback_data="randy_preview")],
            [InlineKeyboardButton(BUTTONS["ANA_MENU"], callback_data="main_menu")],
        ]

        await bot.edit_message_text(
            chat_id=user_id,
            message_id=message_id,
            text=f"{info}\n\n{MENU['RANDY_AYARLARI']}",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode="HTML"
        )
    except TelegramError as e:
        logger.error(f"❌ Menü güncelleme hatası: {e}")


async def _show_channels_menu_updated(bot, user_id: int, message_id: int, group_id: int):
    """Zorunlu kanal menüsünü güncelle"""
    from templates import BUTTONS

    try:
        draft = await get_draft(user_id, group_id)
        if not draft:
            return

        channels = await get_draft_channels(user_id, group_id)

        if channels:
            channel_list = []
            for ch in channels:
                if ch.get('channel_username'):
                    channel_list.append(f"• @{ch['channel_username']}")
                elif ch.get('channel_title'):
                    channel_list.append(f"• {ch['channel_title']}")
                else:
                    channel_list.append(f"• Kanal ID: {ch['channel_id']}")

            channel_text = "\n".join(channel_list)
            info_text = f"✅ Kanal eklendi!\n\n📢 <b>Zorunlu Kanallar ({len(channels)}):</b>\n{channel_text}\n\n"
        else:
            info_text = "📢 <b>Henüz zorunlu kanal eklenmedi.</b>\n\n"

        keyboard = []

        for ch in channels:
            if ch.get('channel_username'):
                btn_text = f"❌ @{ch['channel_username']}"
            else:
                btn_text = f"❌ {ch.get('channel_title', 'Kanal')}"
            keyboard.append([
                InlineKeyboardButton(btn_text, callback_data=f"randy_channel_remove_{ch['channel_id']}")
            ])

        if channels:
            keyboard.append([InlineKeyboardButton("🗑️ Tüm Kanalları Temizle", callback_data="randy_channels_clear")])

        keyboard.append([InlineKeyboardButton(BUTTONS["GERI"], callback_data="randy_back")])

        await bot.edit_message_text(
            chat_id=user_id,
            message_id=message_id,
            text=f"{info_text}📝 Kanal eklemek için @username gönderin:",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode="HTML"
        )
    except TelegramError as e:
        logger.error(f"❌ Kanal menüsü güncelleme hatası: {e}")


async def _show_allowed_channels_updated(bot, user_id: int, message_id: int, group_id: int, draft_id: int):
    """Açılacak kanallar menüsünü güncelle"""
    from templates import BUTTONS
    from services.randy_service import get_draft, get_selected_channel

    try:
        draft = await get_draft(user_id, group_id)
        if not draft:
            return

        channels = await get_allowed_channels(draft_id)
        selected_channel = draft.get('selected_channel_id')

        text = (
            "✅ Kanal eklendi!\n\n"
            "📍 <b>Randy Açılacak Kanallar</b>\n\n"
            "💡 <i>Şartsız işaretli kanallarda mesaj şartı uygulanmaz.</i>\n\n"
        )

        if channels:
            text += "<b>Eklenen Kanallar:</b>\n"
            for ch in channels:
                name = f"@{ch['channel_username']}" if ch.get('channel_username') else ch.get('channel_title', 'Kanal')
                enabled = "✅" if ch.get('is_enabled') else "❌"
                no_req = " [ŞARTSIZ]" if ch.get('no_requirement') else ""
                selected = " 📌" if ch['channel_id'] == selected_channel else ""
                text += f"• {enabled} {name}{no_req}{selected}\n"

        keyboard = []

        for ch in channels:
            name = f"@{ch['channel_username']}" if ch.get('channel_username') else ch.get('channel_title', 'Kanal')[:15]
            ch_id = ch['channel_id']

            row = [
                InlineKeyboardButton(f"{'✅' if ch.get('is_enabled') else '❌'}", callback_data=f"randy_allowed_toggle_{ch_id}"),
                InlineKeyboardButton(f"{'🔓' if ch.get('no_requirement') else '🔒'}", callback_data=f"randy_allowed_noreq_{ch_id}"),
                InlineKeyboardButton("📌", callback_data=f"randy_select_channel_{ch_id}"),
                InlineKeyboardButton("🗑️", callback_data=f"randy_allowed_remove_{ch_id}"),
            ]
            keyboard.append([InlineKeyboardButton(name, callback_data="noop")])
            keyboard.append(row)

        keyboard.append([InlineKeyboardButton("➕ Kanal Ekle", callback_data="randy_add_allowed_channel")])
        keyboard.append([InlineKeyboardButton(BUTTONS["GERI"], callback_data="randy_back")])

        await bot.edit_message_text(
            chat_id=user_id,
            message_id=message_id,
            text=text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode="HTML"
        )
    except TelegramError as e:
        logger.error(f"❌ Açılacak kanallar menüsü güncelleme hatası: {e}")
