import requests
import re
import asyncio
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters, CallbackContext

# Replace with your bot token
BOT_TOKEN = "8049379557:AAFTFfol-zFUxQDMCGypVwAHRsd6vl0oNqs"

# IPTV M3U URL
M3U_URL = "http://mu3241218.oknirvana.club:8880/get.php?username=D12m1040&password=84227782&type=m3u_plus"

# Pagination settings
CHANNELS_PER_PAGE = 5

# Function to fetch and parse M3U playlist
def fetch_channels():
    response = requests.get(M3U_URL)
    if response.status_code == 200:
        content = response.text
        channels = re.findall(r'#EXTINF:-1.*?,(.*?)\n(http.*?)\n', content)
        return list(channels)
    return []

# Global variable to store channels
CHANNELS = fetch_channels()

# Start command
async def start(update: Update, context: CallbackContext) -> None:
    keyboard = [[InlineKeyboardButton("📺 View Channels", callback_data="channels_0")]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text("Welcome! Choose an option:", reply_markup=reply_markup)

# List channels with pagination
async def list_channels(update: Update, context: CallbackContext) -> None:
    query = update.callback_query
    await query.answer()

    page = int(query.data.split("_")[1])
    start = page * CHANNELS_PER_PAGE
    end = start + CHANNELS_PER_PAGE
    paginated_channels = CHANNELS[start:end]

    if not paginated_channels:
        await query.edit_message_text("No channels found.")
        return

    keyboard = [
        [InlineKeyboardButton(f"▶ {name}", callback_data=f"play_{idx}")] 
        for idx, (name, _) in enumerate(paginated_channels, start=start)
    ]

    navigation_buttons = []
    if start > 0:
        navigation_buttons.append(InlineKeyboardButton("⬅ Previous", callback_data=f"channels_{page - 1}"))
    if end < len(CHANNELS):
        navigation_buttons.append(InlineKeyboardButton("Next ➡", callback_data=f"channels_{page + 1}"))

    if navigation_buttons:
        keyboard.append(navigation_buttons)

    reply_markup = InlineKeyboardMarkup(keyboard)
    await query.edit_message_text("📺 Select a channel to play:", reply_markup=reply_markup)

# Play a channel inside Telegram (if MP4) or via Web Player
async def play_channel(update: Update, context: CallbackContext) -> None:
    query = update.callback_query
    await query.answer()

    index = int(query.data.split("_")[1])
    channel_name, channel_url = CHANNELS[index]

    # If the URL ends with .mp4, send it directly to Telegram
    if channel_url.endswith(".mp4"):
        await query.message.reply_video(
            video=channel_url,
            caption=f"🎬 Now Playing: {channel_name}",
            supports_streaming=True
        )
    else:
        # Convert M3U8 to MP4 link (alternative)
        video_player_link = f"https://videojs-http-streaming.netlify.app/?src={channel_url}"

        message_text = f"""
🎬 **Now Playing:** {channel_name}

▶ **Watch on Web Player:** [Click Here]({video_player_link})

📲 **Open in MX Player / VLC:**
- **MX Player:** `intent:{channel_url}#Intent;package=com.mxtech.videoplayer.ad;type=video/*;end`
- **VLC Player:** `vlc://{channel_url}`
"""

        await query.message.reply_text(message_text, parse_mode="Markdown", disable_web_page_preview=True)

# Search for a channel (Automatically triggered on user input)
async def search_channel(update: Update, context: CallbackContext) -> None:
    query = update.message.text.strip().lower()

    if not query:
        return  # Ignore empty messages

    results = [(idx, name, url) for idx, (name, url) in enumerate(CHANNELS) if query in name.lower()]

    if not results:
        await update.message.reply_text(f"❌ No channels found for: `{query}`", parse_mode="Markdown")
        return

    keyboard = [[InlineKeyboardButton(f"▶ {name}", callback_data=f"play_{idx}")] for idx, name, url in results]
    reply_markup = InlineKeyboardMarkup(keyboard)

    await update.message.reply_text(f"🔎 **Search Results for:** `{query}`", reply_markup=reply_markup, parse_mode="Markdown")

# Main function to run the bot
def main():
    app = Application.builder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(list_channels, pattern="^channels_"))
    app.add_handler(CallbackQueryHandler(play_channel, pattern="^play_"))

    # Listen for any user message to trigger search
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, search_channel))

    app.run_polling()

if __name__ == "__main__":
    main()
