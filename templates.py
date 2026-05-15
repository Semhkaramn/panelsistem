"""
📝 Mesaj Şablonları
Randy bot için tüm metin şablonları
"""

# Ana Menü
MENU = {
    "ANA_MENU": (
        "🎲 <b>Randy Yönetim Paneli</b>\n\n"
        "Aşağıdaki seçeneklerden birini seçin:"
    ),
    "RANDY_AYARLARI": (
        "⚙️ <b>Randy Ayarları</b>\n\n"
        "Aşağıdaki ayarları düzenleyebilirsiniz:\n\n"
        "💡 <i>Ayarlar kalıcıdır, her Randy için yeniden ayarlamaya gerek yok.</i>"
    ),
    "MESAJ_AYARLA": (
        "{current_value}"
        "📝 Randy için gösterilecek mesajı yazın:\n\n"
        "<i>Bu mesaj çekiliş duyurusunda görünecek.</i>"
    ),
    "SART_SEC": (
        "{current_value}"
        "📊 <b>Katılım Şartı</b>\n\n"
        "Randy'ye katılmak için gerekli şartı seçin:"
    ),
    "MESAJ_SAYISI_GIR": (
        "{current_value}"
        "🔢 <b>Mesaj Sayısı</b>\n\n"
        "Kaç mesaj gerektiğini yazın:\n\n"
        "<i>Örnek: 50</i>"
    ),
    "KAZANAN_SAYISI": (
        "{current_value}"
        "🏆 <b>Kazanan Sayısı</b>\n\n"
        "Kaç kişinin kazanacağını yazın:\n\n"
        "<i>Örnek: 3</i>"
    ),
    "MEDYA_GONDER": (
        "{current_value}"
        "🖼️ <b>Medya Ekle</b>\n\n"
        "Randy için bir medya (fotoğraf, video, GIF) gönderin.\n\n"
        "<i>Medyayı kaldırmak için butonu kullanın.</i>"
    ),
    "KANAL_SEC": (
        "📢 <b>Randy Kanalları</b>\n\n"
        "Randy'nin hangi kanallarda/gruplarda açılabileceğini seçin.\n\n"
        "💡 <i>Kanal eklemek için @kanaladi veya ID gönderin.</i>"
    ),
    "ZORUNLU_KANAL": (
        "📢 <b>Zorunlu Kanallar</b>\n\n"
        "Katılımcıların üye olması gereken kanalları ekleyin.\n\n"
        "💡 <i>Kanal eklemek için @kanaladi gönderin.</i>"
    ),
    "ONIZLEME": (
        "👁️ <b>Önizleme</b>\n\n"
        "{preview}\n\n"
        "━━━━━━━━━━━━━━━━━━━━━━\n"
        "• Grup: {group}\n"
        "• Şart: {requirement}\n"
        "• Kazanan: {winners} kişi\n"
        "• Medya: {media}\n"
        "• Sabitleme: {pin}"
    ),
}

# Randy Mesajları
RANDY = {
    "BASLADI": (
        "🎲 <b>RANDY BAŞLADI!</b>\n\n"
        "{message}\n\n"
        "{channels_text}"
        "👥 Katılımcı: <b>{participants}</b>\n"
        "🏆 Kazanan: <b>{winners}</b> kişi"
    ),
    "BASLADI_SARTLI": (
        "🎲 <b>RANDY BAŞLADI!</b>\n\n"
        "{message}\n\n"
        "📊 <b>Şart:</b> {requirement}\n\n"
        "{channels_text}"
        "👥 Katılımcı: <b>{participants}</b>\n"
        "🏆 Kazanan: <b>{winners}</b> kişi"
    ),
    "BITTI": (
        "🎊 <b>RANDY BİTTİ!</b>\n\n"
        "👥 Toplam katılımcı: <b>{participants}</b>\n\n"
        "🏆 <b>Kazananlar:</b>\n{winner_list}"
    ),
    "BITTI_KATILIMCI_AZ": (
        "🎊 <b>RANDY BİTTİ!</b>\n\n"
        "⚠️ Yeterli katılımcı olmadığı için ({participants}/{winner_count}) "
        "mevcut tüm katılımcılar kazandı!\n\n"
        "🏆 <b>Kazananlar:</b>\n{winner_list}"
    ),
    "KAZANAN_YOK": (
        "😢 <b>RANDY BİTTİ!</b>\n\n"
        "Hiç katılımcı olmadığı için kazanan yok."
    ),
    "BASARIYLA_KATILDIN": "🎉 Başarıyla katıldınız! İyi şanslar!",
    "ZATEN_KATILDIN": "⚠️ Zaten bu Randy'ye katılmışsınız!",
    "AKTIF_DEGIL": "❌ Bu Randy artık aktif değil.",
    "KANAL_UYESI_DEGIL": "❌ Katılmak için şu kanallara üye olmalısınız:\n{channels}",
    "MESAJ_SARTI_KARSILANMADI": (
        "❌ Katılım şartını karşılamıyorsunuz!\n\n"
        "📊 Gerekli: {period} {required} mesaj\n"
        "📈 Sizin: {current} mesaj"
    ),
    "POST_RANDY_SARTI": (
        "❌ Katılım şartını karşılamıyorsunuz!\n\n"
        "📊 Gerekli: Randy sonrası {required} mesaj\n"
        "📈 Sizin: {current} mesaj"
    ),
    "ADMIN_KATILAMAZ": "❌ Adminler Randy'ye katılamaz!",
    "DEVRE_DISI": "⚠️ Bu kanalda Randy devre dışı.",
}

# Butonlar
BUTTONS = {
    "RANDY_YONETIMI": "🎲 Randy Yönetimi",
    "RANDY_AYARLARI": "⚙️ Randy Ayarları",
    "MESAJ_AYARLA": "📝 Mesaj Ayarla",
    "SART_AYARLA": "📊 Şart Ayarla",
    "KAZANAN_AYARLA": "🏆 Kazanan Sayısı",
    "MEDYA_EKLE": "🖼️ Medya",
    "KANAL_EKLE": "📢 Zorunlu Kanallar",
    "ACILACAK_KANALLAR": "📍 Açılacak Kanallar",
    "SABITLE": "📌 Sabitle",
    "ONIZLE": "👁️ Önizle",
    "KAYDET": "💾 Kaydet",
    "ANA_MENU": "🏠 Ana Menü",
    "GERI": "◀️ Geri",
    "IPTAL": "❌ Kapat",
    "SARTSIZ": "➖ Şartsız",
    "GUNLUK_MESAJ": "📅 Günlük Mesaj",
    "HAFTALIK_MESAJ": "📆 Haftalık Mesaj",
    "AYLIK_MESAJ": "📅 Aylık Mesaj",
    "TOPLAM_MESAJ": "📊 Toplam Mesaj",
    "RANDY_SONRASI": "🎲 Randy Sonrası",
    "AC_KAPAT": "🔄 Aç/Kapat",
}

# Hatalar
ERRORS = {
    "GENEL": "❌ Bir hata oluştu. Lütfen tekrar deneyin.",
    "YETKI_YOK": "❌ Bu işlem için yetkiniz yok.",
    "GRUP_BULUNAMADI": "❌ Grup bulunamadı.",
}

# Başarı
SUCCESS = {
    "KAYDEDILDI": "✅ Ayarlar kaydedildi!",
    "EKLENDI": "✅ Eklendi!",
    "SILINDI": "✅ Silindi!",
}


def format_winner_list(winners: list) -> str:
    """Kazanan listesini formatla"""
    if not winners:
        return "Kazanan yok"

    lines = []
    for i, winner in enumerate(winners, 1):
        if winner.get('username'):
            name = f"@{winner['username']}"
        elif winner.get('first_name'):
            name = winner['first_name']
        else:
            name = f"Kullanıcı {str(winner['telegram_id'])[-4:]}"

        mention = f'<a href="tg://user?id={winner["telegram_id"]}">{name}</a>'
        lines.append(f"{i}. {mention}")

    return "\n".join(lines)


def get_period_text(period: str) -> str:
    """Periyod metnini döndür"""
    periods = {
        'daily': 'Günlük',
        'weekly': 'Haftalık',
        'monthly': 'Aylık',
        'all_time': 'Toplam',
        'post_randy': 'Randy sonrası'
    }
    return periods.get(period, period)


def get_media_type_text(media_type: str) -> str:
    """Medya tipi metnini döndür"""
    types = {
        'none': 'Yok',
        'photo': 'Fotoğraf',
        'video': 'Video',
        'animation': 'GIF'
    }
    return types.get(media_type, media_type)


# Kullanıcı İstatistikleri
STATS = {
    "USER_CARD": (
        "📊 <b>{name}</b> {username_line}\n\n"
        "━━━━━━━━━━━━━━━━━━━━━━\n"
        "📈 <b>Mesaj İstatistikleri</b>\n"
        "  Günlük  ➜  <b>{daily}</b>\n"
        "  Haftalık  ➜  <b>{weekly}</b>\n"
        "  Aylık  ➜  <b>{monthly}</b>\n"
        "  Toplam  ➜  <b>{total}</b>\n\n"
        "🎲 <b>Randy İstatistikleri</b>\n"
        "  Katılım  ➜  <b>{randy_participated}</b>\n"
        "  Kazanma  ➜  <b>{randy_won}</b>\n"
        "{win_rate_line}\n\n"
        "🏅 <b>Sıralama</b>\n"
        "  Günlük  ➜  <b>#{daily_rank}</b>\n"
        "  Haftalık  ➜  <b>#{weekly_rank}</b>\n"
        "  Aylık  ➜  <b>#{monthly_rank}</b>\n"
        "━━━━━━━━━━━━━━━━━━━━━━"
    ),
    "KAYIT_YOK": (
        "📭 <b>Kayıt Bulunamadı</b>\n\n"
        "Henüz grupta mesaj atmamışsınız veya kayıt yok."
    ),
    "BOT_BASLAT": (
        "👋 {mention}, İstatistiklerini görmek için önce botu başlat:"
    ),
}
