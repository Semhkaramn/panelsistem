"""
🔘 Callback Handler
Buton tıklamalarını yönetir
"""

import re
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, LinkPreviewOptions
from telegram.ext import ContextTypes
from telegram.error import TelegramError, BadRequest
import logging

logger = logging.getLogger(__name__)

# Link önizlemelerini kapatmak için
DISABLE_PREVIEW = LinkPreviewOptions(is_disabled=True)

from templates import (
    MENU, RANDY, BUTTONS, ERRORS, SUCCESS, STATS,
    format_winner_list, get_period_text, get_media_type_text
)
from services.randy_service import (
    get_draft, update_draft,
    get_user_admin_groups, join_randy, get_participant_count,
    get_randy_by_id, end_randy,
    add_channel_to_draft, remove_channel_from_draft,
    get_draft_channels, clear_draft_channels,
    get_or_create_group_draft, toggle_admin_can_join,
    get_admin_can_join, add_allowed_channel, remove_allowed_channel,
    toggle_allowed_channel, toggle_channel_no_requirement,
    get_allowed_channels, set_selected_channel, get_selected_channel,
    get_full_user_stats, is_user_registered
)
from utils.admin_check import is_group_admin, is_activity_group_admin


# ============================================
# YARDIMCI FONKSİYONLAR
# ============================================

async def safe_answer(query, text: str = None, show_alert: bool = False):
    """Callback query'yi güvenli şekilde cevapla."""
    try:
        await query.answer(text, show_alert=show_alert)
        return True
    except BadRequest as e:
        if "Query is too old" in str(e) or "query id is invalid" in str(e):
            pass
        else:
            logger.error(f"❌ Callback answer hatası: {e}")
        return False
    except TelegramError as e:
        logger.error(f"❌ Callback answer hatası: {e}")
        return False


# ============================================
# CALLBACK ROUTER
# ============================================

DIRECT_CALLBACKS = {
    # Menü kontrolleri
    "close_menu": ("close_menu", False, None),
    "main_menu": ("show_main_menu", False, None),

    # Randy menüsü
    "randy_menu": ("start_randy_settings", True, None),
    "randy_settings": ("start_randy_settings", True, None),
    "randy_message": ("prompt_message", True, None),
    "randy_requirement": ("show_requirement_menu", True, None),
    "randy_msg_count": ("prompt_message_count", True, None),
    "randy_winners": ("show_winner_count_menu", True, None),
    "randy_media": ("show_media_menu", True, None),
    "randy_channels": ("show_channels_menu", True, None),
    "randy_channels_clear": ("clear_channels", True, None),
    "randy_pin": ("toggle_pin", True, None),
    "randy_preview": ("show_preview", True, None),
    "randy_save": ("save_draft", True, None),
    "randy_cancel": ("cancel_and_go_main", True, None),
    "randy_back": ("go_back_to_randy_settings", True, None),

    # Admin katılım ayarı
    "randy_admin_join": ("toggle_admin_join", True, None),

    # Randy açılacak kanallar
    "randy_allowed_channels": ("show_allowed_channels_menu", True, None),
    "randy_add_allowed_channel": ("prompt_add_allowed_channel", True, None),
}

PATTERN_CALLBACKS = [
    # Randy patterns
    (r"^randy_group_(-?\d+)$", "select_group", "int"),
    (r"^randy_req_(.+)$", "select_requirement", "str"),
    (r"^randy_win_(\d+)$", "select_winner_count", "int"),
    (r"^randy_media_(.+)$", "select_media_type", "str"),
    (r"^randy_channel_remove_(-?\d+)$", "remove_channel", "int"),
    (r"^randy_join_(\d+)$", "handle_randy_join", "int"),

    # Açılacak kanal patterns
    (r"^randy_allowed_toggle_(-?\d+)$", "toggle_allowed_ch", "int"),
    (r"^randy_allowed_noreq_(-?\d+)$", "toggle_no_requirement", "int"),
    (r"^randy_allowed_remove_(-?\d+)$", "remove_allowed_ch", "int"),
    (r"^randy_select_channel_(-?\d+)$", "select_open_channel", "int"),

    # Kullanıcı işlemleri
    (r"^check_started_(\d+)$", "handle_check_started", "int"),
    (r"^ben_stats_(-?\d+)$", "handle_ben_stats", "int"),
]


async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Ana callback handler - Router Pattern ile"""
    query = update.callback_query
    data = query.data
    user_id = query.from_user.id

    # Randy join ve check_started için answer'ı kendi içinde yapacağız
    if not data.startswith("randy_join_") and not data.startswith("check_started_"):
        answered = await safe_answer(query)
        if not answered:
            return

    # Menü mesaj ID'sini kaydet
    if query.message:
        context.user_data['menu_message_id'] = query.message.message_id

    # 1. Direkt eşleşme kontrolü
    if data in DIRECT_CALLBACKS:
        handler_name, needs_user_id, extra_args = DIRECT_CALLBACKS[data]
        handler = globals()[handler_name]

        if extra_args:
            await handler(query, user_id, *extra_args, context)
        elif needs_user_id:
            await handler(query, user_id, context)
        else:
            await handler(query, context)
        return

    # 2. Pattern eşleşme kontrolü
    for pattern, handler_name, value_type in PATTERN_CALLBACKS:
        match = re.match(pattern, data)
        if match:
            handler = globals()[handler_name]
            value = match.group(1)

            if value_type == "int":
                value = int(value)

            await handler(query, user_id, value, context)
            return

    logger.warning(f"⚠️ Bilinmeyen callback: {data}")


# ============================================
# ANA MENÜ FONKSİYONLARI
# ============================================

async def close_menu(query, context: ContextTypes.DEFAULT_TYPE):
    """Menüyü kapat"""
    try:
        await query.message.delete()
    except TelegramError:
        try:
            await query.edit_message_text("✅ Menü kapatıldı.", reply_markup=None, parse_mode="HTML")
        except TelegramError:
            pass

    context.user_data.pop('menu_message_id', None)
    context.user_data.pop('active_group_id', None)
    context.user_data.pop('waiting_for', None)


def _get_main_menu_keyboard() -> InlineKeyboardMarkup:
    """Ana menü keyboard'u"""
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(BUTTONS["RANDY_YONETIMI"], callback_data="randy_menu")],
        [InlineKeyboardButton(BUTTONS["IPTAL"], callback_data="close_menu")],
    ])


async def show_main_menu(query, context: ContextTypes.DEFAULT_TYPE = None):
    """Ana menüyü göster"""
    await query.edit_message_text(
        MENU["ANA_MENU"],
        reply_markup=_get_main_menu_keyboard(),
        parse_mode="HTML"
    )


async def show_main_menu_message(message, context: ContextTypes.DEFAULT_TYPE):
    """Ana menüyü mesaj olarak göster"""
    sent_msg = await message.reply_text(
        MENU["ANA_MENU"],
        reply_markup=_get_main_menu_keyboard(),
        parse_mode="HTML"
    )
    context.user_data['menu_message_id'] = sent_msg.message_id


# ============================================
# RANDY MENÜ FONKSİYONLARI
# ============================================

async def start_randy_settings(query, user_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Randy ayarlarına başla"""
    from config import ACTIVITY_GROUP_ID

    # Admin kontrolü
    is_admin = await is_activity_group_admin(context.bot, user_id)

    if not is_admin:
        keyboard = [[InlineKeyboardButton(BUTTONS["ANA_MENU"], callback_data="main_menu")]]
        await query.edit_message_text(
            "❌ <b>Yetkiniz Yok</b>\n\n"
            "Randy ayarları için ana gruptaki admin olmanız gerekiyor.",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode="HTML"
        )
        return

    # Admin olduğu grupları getir
    groups = await get_user_admin_groups(user_id, context.bot)

    if not groups and ACTIVITY_GROUP_ID:
        try:
            chat = await context.bot.get_chat(ACTIVITY_GROUP_ID)
            from services.randy_service import register_group, update_group_admin
            await register_group(ACTIVITY_GROUP_ID, chat.title)
            await update_group_admin(ACTIVITY_GROUP_ID, user_id, True)
            groups = [{'group_id': ACTIVITY_GROUP_ID, 'title': chat.title}]
        except Exception as e:
            logger.error(f"❌ Grup bilgisi alma hatası: {e}")

    if not groups:
        keyboard = [[InlineKeyboardButton(BUTTONS["ANA_MENU"], callback_data="main_menu")]]
        await query.edit_message_text(
            "❌ <b>Admin olduğunuz grup bulunamadı.</b>\n\n"
            "Bot'u gruba ekleyip admin yapın ve grupta /start yazın.",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode="HTML"
        )
        return

    # Tek grup varsa direkt ayarlara git
    if len(groups) == 1:
        group = groups[0]
        group_id = group['group_id']
        await get_or_create_group_draft(user_id, group_id)
        context.user_data['active_group_id'] = group_id
        await show_randy_settings_menu(query, user_id, group_id, context)
        return

    # Birden fazla grup varsa seçim menüsü
    keyboard = []
    for group in groups:
        keyboard.append([
            InlineKeyboardButton(
                group['title'] or f"Grup {group['group_id']}",
                callback_data=f"randy_group_{group['group_id']}"
            )
        ])
    keyboard.append([InlineKeyboardButton(BUTTONS["ANA_MENU"], callback_data="main_menu")])

    await query.edit_message_text(
        "🎲 <b>Randy Ayarları</b>\n\nGrup seçin:",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="HTML"
    )


async def select_group(query, user_id: int, group_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Grup seçildi"""
    draft = await get_or_create_group_draft(user_id, group_id)

    if not draft:
        keyboard = [[InlineKeyboardButton(BUTTONS["ANA_MENU"], callback_data="main_menu")]]
        await query.edit_message_text(
            "❌ Taslak oluşturulamadı.",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode="HTML"
        )
        return

    context.user_data['active_group_id'] = group_id
    await show_randy_settings_menu(query, user_id, group_id, context)


async def show_randy_settings_menu(query, user_id: int, group_id: int, context: ContextTypes.DEFAULT_TYPE = None):
    """Randy ayar menüsünü göster"""
    draft = await get_draft(user_id, group_id)

    if not draft:
        keyboard = [[InlineKeyboardButton(BUTTONS["ANA_MENU"], callback_data="main_menu")]]
        await query.edit_message_text(ERRORS["GENEL"], reply_markup=InlineKeyboardMarkup(keyboard))
        return

    # Durumları göster
    channels = await get_draft_channels(user_id, group_id)
    allowed_channels = await get_allowed_channels(draft['id'])

    message_status = "✅" if draft.get('message') else "❌"

    # Şart durumu
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

    # Admin katılım durumu
    admin_can_join = draft.get('admin_can_join', False)
    admin_join_status = "✅" if admin_can_join else "❌"

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

    await query.edit_message_text(
        MENU["RANDY_AYARLARI"],
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="HTML"
    )


async def toggle_admin_join(query, user_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Admin katılım ayarını toggle et"""
    group_id = context.user_data.get('active_group_id')

    if not group_id:
        await safe_answer(query, "❌ Grup bulunamadı!", show_alert=True)
        return

    success, new_value = await toggle_admin_can_join(group_id)

    if success:
        status = "açıldı" if new_value else "kapatıldı"
        await safe_answer(query, f"✅ Admin katılım {status}!", show_alert=True)
    else:
        await safe_answer(query, "❌ Ayar değiştirilemedi!", show_alert=True)

    await show_randy_settings_menu(query, user_id, group_id, context)


# ============================================
# AÇILACAK KANALLAR MENÜSÜ
# ============================================

async def show_allowed_channels_menu(query, user_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Randy'nin açılabileceği kanalları göster"""
    group_id = context.user_data.get('active_group_id')
    draft = await get_draft(user_id, group_id)

    if not draft:
        keyboard = [[InlineKeyboardButton(BUTTONS["GERI"], callback_data="randy_back")]]
        await query.edit_message_text(ERRORS["GENEL"], reply_markup=InlineKeyboardMarkup(keyboard))
        return

    # İzin verilen kanalları getir
    channels = await get_allowed_channels(draft['id'])
    selected_channel = draft.get('selected_channel_id')

    text = (
        "📍 <b>Randy Açılacak Kanallar</b>\n\n"
        "Randy'nin hangi kanallarda/gruplarda açılabileceğini ayarlayın.\n\n"
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
    else:
        text += "<i>Henüz kanal eklenmedi. Tüm kanallarda açık.</i>\n"

    keyboard = []

    # Her kanal için ayar butonları
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

    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="HTML"
    )


async def prompt_add_allowed_channel(query, user_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Açılacak kanal ekleme için input iste"""
    context.user_data['waiting_for'] = 'randy_allowed_channel'

    keyboard = [[InlineKeyboardButton(BUTTONS["GERI"], callback_data="randy_allowed_channels")]]

    await query.edit_message_text(
        "📍 <b>Kanal Ekle</b>\n\n"
        "Randy'nin açılabileceği kanalın @username veya ID'sini gönderin.\n\n"
        "<i>Örnek: @kanaladi veya -1001234567890</i>",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="HTML"
    )


async def toggle_allowed_ch(query, user_id: int, channel_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Kanalı aç/kapat"""
    group_id = context.user_data.get('active_group_id')
    draft = await get_draft(user_id, group_id)

    if draft:
        success, new_value = await toggle_allowed_channel(draft['id'], channel_id)
        status = "açıldı" if new_value else "kapatıldı"
        await safe_answer(query, f"✅ Kanal {status}!", show_alert=True)

    await show_allowed_channels_menu(query, user_id, context)


async def toggle_no_requirement(query, user_id: int, channel_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Şartsız açılma ayarını toggle et"""
    group_id = context.user_data.get('active_group_id')
    draft = await get_draft(user_id, group_id)

    if draft:
        success, new_value = await toggle_channel_no_requirement(draft['id'], channel_id)
        status = "ŞARTSIZ" if new_value else "ŞARTLI"
        await safe_answer(query, f"✅ Kanal artık {status}!", show_alert=True)

    await show_allowed_channels_menu(query, user_id, context)


async def select_open_channel(query, user_id: int, channel_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Randy açılacak kanalı seç"""
    group_id = context.user_data.get('active_group_id')

    if group_id:
        await set_selected_channel(group_id, channel_id)
        await safe_answer(query, "📌 Bu kanal seçildi!", show_alert=True)

    await show_allowed_channels_menu(query, user_id, context)


async def remove_allowed_ch(query, user_id: int, channel_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Açılacak kanalı sil"""
    group_id = context.user_data.get('active_group_id')
    draft = await get_draft(user_id, group_id)

    if draft:
        await remove_allowed_channel(draft['id'], channel_id)
        await safe_answer(query, "✅ Kanal silindi!", show_alert=True)

    await show_allowed_channels_menu(query, user_id, context)


# ============================================
# DİĞER RANDY AYARLARI
# ============================================

async def prompt_message(query, user_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Mesaj girişi iste"""
    group_id = context.user_data.get('active_group_id')
    draft = await get_draft(user_id, group_id)

    current_value = ""
    if draft and draft.get('message'):
        current_msg = draft['message']
        if len(current_msg) > 100:
            current_msg = current_msg[:100] + "..."
        current_value = f"<b>Mevcut mesaj:</b>\n<i>{current_msg}</i>\n\n"

    context.user_data['waiting_for'] = 'randy_message'

    keyboard = [[InlineKeyboardButton(BUTTONS["GERI"], callback_data="randy_back")]]

    await query.edit_message_text(
        MENU["MESAJ_AYARLA"].format(current_value=current_value),
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="HTML"
    )


async def show_requirement_menu(query, user_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Şart seçim menüsü"""
    group_id = context.user_data.get('active_group_id')
    draft = await get_draft(user_id, group_id)

    current_value = ""
    if draft:
        req_type = draft.get('requirement_type', 'none')
        req_count = draft.get('required_message_count', 0)
        if req_type != 'none' and req_count > 0:
            period_text = get_period_text(req_type)
            current_value = f"<b>Mevcut şart:</b> {period_text} {req_count} mesaj\n\n"
        else:
            current_value = "<b>Mevcut şart:</b> Şartsız\n\n"

    keyboard = [
        [InlineKeyboardButton(BUTTONS["SARTSIZ"], callback_data="randy_req_none")],
        [InlineKeyboardButton(BUTTONS["GUNLUK_MESAJ"], callback_data="randy_req_daily")],
        [InlineKeyboardButton(BUTTONS["HAFTALIK_MESAJ"], callback_data="randy_req_weekly")],
        [InlineKeyboardButton(BUTTONS["AYLIK_MESAJ"], callback_data="randy_req_monthly")],
        [InlineKeyboardButton(BUTTONS["TOPLAM_MESAJ"], callback_data="randy_req_all_time")],
        [InlineKeyboardButton(BUTTONS["RANDY_SONRASI"], callback_data="randy_req_post_randy")],
        [InlineKeyboardButton(BUTTONS["GERI"], callback_data="randy_back")],
    ]

    await query.edit_message_text(
        MENU["SART_SEC"].format(current_value=current_value),
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="HTML"
    )


async def select_requirement(query, user_id: int, req_type: str, context: ContextTypes.DEFAULT_TYPE):
    """Şart seçildi"""
    group_id = context.user_data.get('active_group_id')
    await update_draft(user_id, group_id=group_id, requirement_type=req_type)

    if req_type == 'none':
        await update_draft(user_id, group_id=group_id, required_message_count=0)
        await show_randy_settings_menu(query, user_id, group_id, context)
    else:
        await prompt_message_count(query, user_id, context)


async def prompt_message_count(query, user_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Mesaj sayısı iste"""
    group_id = context.user_data.get('active_group_id')
    draft = await get_draft(user_id, group_id)

    current_value = ""
    if draft and draft.get('required_message_count', 0) > 0:
        current_value = f"<b>Mevcut değer:</b> {draft['required_message_count']} mesaj\n\n"

    context.user_data['waiting_for'] = 'randy_msg_count'

    keyboard = [[InlineKeyboardButton(BUTTONS["GERI"], callback_data="randy_back")]]

    await query.edit_message_text(
        MENU["MESAJ_SAYISI_GIR"].format(current_value=current_value),
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="HTML"
    )


async def show_winner_count_menu(query, user_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Kazanan sayısı"""
    group_id = context.user_data.get('active_group_id')
    draft = await get_draft(user_id, group_id)

    current_value = ""
    if draft:
        winner_count = draft.get('winner_count', 1)
        current_value = f"<b>Mevcut değer:</b> {winner_count} kişi\n\n"

    context.user_data['waiting_for'] = 'randy_winner_count'

    keyboard = [[InlineKeyboardButton(BUTTONS["GERI"], callback_data="randy_back")]]

    await query.edit_message_text(
        MENU["KAZANAN_SAYISI"].format(current_value=current_value),
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="HTML"
    )


async def select_winner_count(query, user_id: int, count: int, context: ContextTypes.DEFAULT_TYPE):
    """Kazanan sayısı seçildi"""
    group_id = context.user_data.get('active_group_id')
    await update_draft(user_id, group_id=group_id, winner_count=count)
    await show_randy_settings_menu(query, user_id, group_id, context)


async def show_media_menu(query, user_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Medya menüsü"""
    group_id = context.user_data.get('active_group_id')
    draft = await get_draft(user_id, group_id)

    current_value = ""
    if draft:
        media_type = draft.get('media_type', 'none')
        if media_type != 'none' and draft.get('media_file_id'):
            media_text = get_media_type_text(media_type)
            current_value = f"<b>Mevcut medya:</b> {media_text} ekli\n\n"
        else:
            current_value = "<b>Mevcut medya:</b> Yok\n\n"

    context.user_data['waiting_for'] = 'randy_media'

    keyboard = [
        [InlineKeyboardButton("🗑️ Medyayı Kaldır", callback_data="randy_media_none")],
        [InlineKeyboardButton(BUTTONS["GERI"], callback_data="randy_back")],
    ]

    await query.edit_message_text(
        MENU["MEDYA_GONDER"].format(current_value=current_value),
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="HTML"
    )


async def select_media_type(query, user_id: int, media_type: str, context: ContextTypes.DEFAULT_TYPE):
    """Medya tipi seçildi"""
    group_id = context.user_data.get('active_group_id')

    if media_type == 'none':
        await update_draft(user_id, group_id=group_id, media_type='none', media_file_id=None)
        await safe_answer(query, "✅ Medya kaldırıldı!", show_alert=True)
        context.user_data.pop('waiting_for', None)
        await show_randy_settings_menu(query, user_id, group_id, context)


async def show_channels_menu(query, user_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Zorunlu kanal menüsü"""
    group_id = context.user_data.get('active_group_id')
    draft = await get_draft(user_id, group_id)

    if not draft:
        keyboard = [[InlineKeyboardButton(BUTTONS["ANA_MENU"], callback_data="main_menu")]]
        await query.edit_message_text(ERRORS["GENEL"], reply_markup=InlineKeyboardMarkup(keyboard))
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
        info_text = f"📢 <b>Zorunlu Kanallar ({len(channels)}):</b>\n{channel_text}\n\n"
    else:
        info_text = "📢 <b>Henüz zorunlu kanal eklenmedi.</b>\n\n"

    context.user_data['waiting_for'] = 'randy_channels'

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

    await query.edit_message_text(
        f"{info_text}📝 Kanal eklemek için @username gönderin:",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="HTML"
    )


async def clear_channels(query, user_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Tüm kanalları temizle"""
    group_id = context.user_data.get('active_group_id')
    await clear_draft_channels(user_id, group_id)
    await safe_answer(query, "✅ Tüm kanallar temizlendi!", show_alert=True)
    await show_channels_menu(query, user_id, context)


async def remove_channel(query, user_id: int, channel_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Tek kanal sil"""
    group_id = context.user_data.get('active_group_id')
    await remove_channel_from_draft(user_id, channel_id, group_id)
    await safe_answer(query, "✅ Kanal silindi!", show_alert=True)
    await show_channels_menu(query, user_id, context)


async def toggle_pin(query, user_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Sabitleme toggle"""
    group_id = context.user_data.get('active_group_id')
    draft = await get_draft(user_id, group_id)

    if draft:
        new_value = not draft.get('pin_message', False)
        await update_draft(user_id, group_id=group_id, pin_message=new_value)
        status = "açıldı" if new_value else "kapatıldı"
        await safe_answer(query, f"📌 Sabitleme {status}!", show_alert=True)

    await show_randy_settings_menu(query, user_id, group_id, context)


async def show_preview(query, user_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Önizleme göster"""
    group_id = context.user_data.get('active_group_id')
    draft = await get_draft(user_id, group_id)

    if not draft:
        keyboard = [[InlineKeyboardButton(BUTTONS["ANA_MENU"], callback_data="main_menu")]]
        await query.edit_message_text(ERRORS["GENEL"], reply_markup=InlineKeyboardMarkup(keyboard))
        return

    message = draft.get('message', 'Mesaj belirlenmedi')
    preview = f"🎉 <b>RANDY BAŞLADI!</b>\n\n{message}"

    req_type = draft.get('requirement_type', 'none')
    if req_type != 'none':
        period_text = get_period_text(req_type)
        req_count = draft.get('required_message_count', 0)
        requirement = f"{period_text} {req_count} mesaj"
    else:
        requirement = "Şartsız"

    media_type = draft.get('media_type', 'none')
    media = get_media_type_text(media_type)
    pin = "Evet" if draft.get('pin_message') else "Hayır"

    channels = await get_draft_channels(user_id, group_id)
    if channels:
        channel_names = []
        for ch in channels:
            if ch.get('channel_username'):
                channel_names.append(f"@{ch['channel_username']}")
            else:
                channel_names.append(ch.get('channel_title', 'Kanal'))
        channel_info = ", ".join(channel_names)
    else:
        channel_info = "Yok"

    admin_join = "Evet" if draft.get('admin_can_join') else "Hayır"

    text = MENU["ONIZLEME"].format(
        preview=preview,
        group=f"Grup ID: {draft.get('group_id', 'Belirlenmedi')}",
        requirement=requirement,
        winners=draft.get('winner_count', 1),
        media=media,
        pin=pin
    )
    text += f"\n• Zorunlu Kanallar: {channel_info}"
    text += f"\n• Admin Katılabilir: {admin_join}"

    keyboard = [[InlineKeyboardButton(BUTTONS["GERI"], callback_data="randy_back")]]

    await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="HTML")


async def save_draft(query, user_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Taslağı kaydet"""
    group_id = context.user_data.get('active_group_id')
    draft = await get_draft(user_id, group_id)

    if not draft:
        keyboard = [[InlineKeyboardButton(BUTTONS["ANA_MENU"], callback_data="main_menu")]]
        await query.edit_message_text(ERRORS["GENEL"], reply_markup=InlineKeyboardMarkup(keyboard))
        return

    if not draft.get('group_id'):
        await safe_answer(query, "❌ Grup seçilmedi!", show_alert=True)
        return

    if not draft.get('message'):
        await safe_answer(query, "❌ Mesaj zorunludur!", show_alert=True)
        return

    keyboard = [[InlineKeyboardButton(BUTTONS["ANA_MENU"], callback_data="main_menu")]]

    await query.edit_message_text(
        "✅ <b>Randy ayarları kaydedildi!</b>\n\n"
        "Grupta <code>/randy</code> yazarak çekilişi başlatabilirsiniz.",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="HTML"
    )


async def cancel_and_go_main(query, user_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Ana menüye dön"""
    context.user_data.pop('active_group_id', None)
    context.user_data.pop('waiting_for', None)
    await show_main_menu(query, context)


async def go_back_to_randy_settings(query, user_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Randy ayarlarına geri dön"""
    context.user_data.pop('waiting_for', None)
    group_id = context.user_data.get('active_group_id')

    if group_id:
        await show_randy_settings_menu(query, user_id, group_id, context)
    else:
        await start_randy_settings(query, user_id, context)


# ============================================
# .BEN İSTATİSTİK CALLBACK
# ============================================

async def handle_check_started(query, user_id: int, target_user_id: int, context: ContextTypes.DEFAULT_TYPE):
    """
    Bot başlatma kontrolü - .ben komutu için
    Kullanıcı butona tıklayınca botu başlatıp başlatmadığını kontrol et
    """
    from config import BOT_USERNAME

    # Sadece hedef kullanıcı tıklayabilir
    if user_id != target_user_id:
        await safe_answer(query, "Bu buton sana ait değil!", show_alert=True)
        return

    chat = query.message.chat
    if not chat or chat.type not in ['group', 'supergroup']:
        await safe_answer(query, "Bu komut sadece gruplarda çalışır.", show_alert=True)
        return

    # Bot username'ini al
    bot_username = BOT_USERNAME or (await context.bot.get_me()).username

    # Kullanıcı botu başlatmış mı kontrol et - özelden mesaj göndermeyi dene
    try:
        # Özelden istatistik mesajı gönder
        stats = await get_full_user_stats(user_id, chat.id)

        if stats:
            try:
                user_info = await context.bot.get_chat(user_id)
                username = user_info.username
                first_name = user_info.first_name or "Kullanıcı"
            except TelegramError:
                username = None
                first_name = "Kullanıcı"

            username_line = f"• @{username}" if username else ""

            if stats.get('randy_participated', 0) > 0:
                win_rate = (stats.get('randy_won', 0) / stats['randy_participated']) * 100
                win_rate_line = f"    Oran  ➜  <b>%{win_rate:.1f}</b>"
            else:
                win_rate_line = ""

            display_name = f"@{username}" if username else first_name
            mention = f'<a href="tg://user?id={user_id}">{display_name}</a>'

            stats_text = STATS["USER_CARD"].format(
                name=first_name,
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

            stats_text = f"👋 {mention}\n\n{stats_text}"
        else:
            stats_text = STATS["KAYIT_YOK"]

        # ÖNCE özelden mesaj göndermeyi dene - bu başarılı olursa bot başlatılmış demektir
        await context.bot.send_message(
            chat_id=user_id,
            text=stats_text,
            parse_mode="HTML"
        )

        # Bot başlatılmış - grupta mesajı sil
        try:
            await query.message.delete()
        except TelegramError:
            # Silinemezse düzenle
            try:
                await query.edit_message_text(
                    f"📨 İstatistiklerin özelden gönderildi!",
                    reply_markup=None,
                    parse_mode="HTML"
                )
            except TelegramError:
                pass

        await safe_answer(query, "✅ İstatistiklerin özelden gönderildi!", show_alert=False)

    except TelegramError:
        # Kullanıcı botu henüz başlatmamış - deep link göster
        deep_link = f"https://t.me/{bot_username}?start=stats_{chat.id}"
        await safe_answer(
            query,
            f"❌ Önce botu başlat!\n\nTıkla: {deep_link}",
            show_alert=True
        )


async def handle_ben_stats(query, user_id: int, target_user_id: int, context: ContextTypes.DEFAULT_TYPE):
    """İstatistikleri göster callback"""
    # Sadece hedef kullanıcı tıklayabilir
    if user_id != target_user_id:
        await safe_answer(query, "Bu buton sana ait değil!", show_alert=True)
        return

    chat = query.message.chat
    if not chat or chat.type not in ['group', 'supergroup']:
        await safe_answer(query, "Bu komut sadece gruplarda çalışır.", show_alert=True)
        return

    stats = await get_full_user_stats(user_id, chat.id)

    if stats:
        try:
            user_info = await context.bot.get_chat(user_id)
            username = user_info.username
            first_name = user_info.first_name or "Kullanıcı"
        except TelegramError:
            username = None
            first_name = "Kullanıcı"

        username_line = f"• @{username}" if username else ""

        if stats.get('randy_participated', 0) > 0:
            win_rate = (stats.get('randy_won', 0) / stats['randy_participated']) * 100
            win_rate_line = f"    Oran  ➜  <b>%{win_rate:.1f}</b>"
        else:
            win_rate_line = ""

        display_name = f"@{username}" if username else first_name
        mention = f'<a href="tg://user?id={user_id}">{display_name}</a>'

        stats_text = STATS["USER_CARD"].format(
            name=first_name,
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
            activity_rank='-'
        )

        stats_text = f"👋 {mention}\n\n{stats_text}"
    else:
        stats_text = STATS["KAYIT_YOK"]

    await safe_answer(query, show_alert=False)

    try:
        await query.edit_message_text(stats_text, parse_mode="HTML", reply_markup=None)
    except TelegramError:
        await context.bot.send_message(chat_id=chat.id, text=stats_text, parse_mode="HTML")


# ============================================
# RANDY KATILIM
# ============================================

async def handle_randy_join(query, user_id: int, randy_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Randy'ye katılım"""
    from services.randy_service import get_randy_channels
    from config import ACTIVITY_GROUP_ID

    username = query.from_user.username
    first_name = query.from_user.first_name

    success, code = await join_randy(randy_id, user_id, username, first_name, context.bot)

    if success:
        await safe_answer(query, RANDY["BASARIYLA_KATILDIN"], show_alert=True)

        count = await get_participant_count(randy_id)
        randy = await get_randy_by_id(randy_id)

        if randy:
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

            randy_channels = await get_randy_channels(randy_id)
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
                new_text = RANDY["BASLADI_SARTLI"].format(
                    message=randy['message'],
                    requirement=requirement,
                    channels_text=channels_text,
                    participants=count,
                    winners=randy['winner_count']
                )
            else:
                new_text = RANDY["BASLADI"].format(
                    message=randy['message'],
                    channels_text=channels_text,
                    participants=count,
                    winners=randy['winner_count']
                )

            keyboard = [[
                InlineKeyboardButton(f"🎉 Katıl ({count})", callback_data=f"randy_join_{randy_id}")
            ]]

            try:
                try:
                    await query.edit_message_text(
                        new_text,
                        reply_markup=InlineKeyboardMarkup(keyboard),
                        parse_mode="HTML",
                        link_preview_options=DISABLE_PREVIEW
                    )
                except TelegramError as text_err:
                    if "no text" in str(text_err).lower():
                        await query.edit_message_caption(
                            caption=new_text,
                            reply_markup=InlineKeyboardMarkup(keyboard),
                            parse_mode="HTML"
                        )
                    else:
                        raise text_err
            except TelegramError as e:
                logger.error(f"❌ Randy mesaj güncelleme hatası: {e}")

    elif code == "zaten_katildi":
        await safe_answer(query, RANDY["ZATEN_KATILDIN"], show_alert=True)

    elif code == "aktif_degil":
        await safe_answer(query, RANDY["AKTIF_DEGIL"], show_alert=True)

    elif code.startswith("kanal_uyesi_degil:"):
        channels = code.split(":", 1)[1]
        await safe_answer(query, RANDY["KANAL_UYESI_DEGIL"].format(channels=channels), show_alert=True)

    elif code.startswith("mesaj_sarti:"):
        parts = code.split(":")
        period = get_period_text(parts[1])
        required = parts[2]
        current = parts[3]
        await safe_answer(query, RANDY["MESAJ_SARTI_KARSILANMADI"].format(
            period=period, required=required, current=current
        ), show_alert=True)

    elif code.startswith("post_randy:"):
        parts = code.split(":")
        required = parts[1]
        current = parts[2]
        await safe_answer(query, RANDY["POST_RANDY_SARTI"].format(required=required, current=current), show_alert=True)

    elif code == "admin_katilamaz":
        await safe_answer(query, RANDY["ADMIN_KATILAMAZ"], show_alert=True)

    else:
        await safe_answer(query, ERRORS["GENEL"], show_alert=True)
