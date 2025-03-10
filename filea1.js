const BOT_TOKEN = "8049379557:AAFTFfol-zFUxQDMCGypVwAHRsd6vl0oNqs";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const M3U_URL = "http://tv.zeuspro.xyz:2052/get.php?username=Y8j7ByPgL2&password=MC5yEDwNEx&type=m3u_plus"

Please use IPTV app to open this link (http://play.google.com/store/apps/details?id=ru.iptvremote.android.iptv)";
const CHANNELS_PER_PAGE = 5;

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

// Fetch and parse M3U playlist
async function fetchChannels() {
  const response = await fetch(M3U_URL);
  if (!response.ok) {
    console.log("Failed to fetch M3U file");
    return [];
  }

  const content = await response.text();
  console.log("Fetched M3U Content:", content); // Debugging log

  const regex = /#EXTINF.*?,\s*(.*?)\s*\n(http[^\s]+)/g;
  let match;
  let channels = [];

  while ((match = regex.exec(content)) !== null) {
    channels.push({ name: match[1].trim(), url: match[2].trim() });
  }

  console.log("Extracted Channels:", channels); // Debugging log

  return channels;
}

// Handle incoming Telegram messages
async function handleRequest(request) {
  if (request.method === "POST") {
    let update = await request.json();
    if (update.message) {
      await processTelegramMessage(update.message);
    } else if (update.callback_query) {
      await processCallbackQuery(update.callback_query);
    }
    return new Response("OK");
  }

  return new Response("Invalid request", { status: 400 });
}

// Process commands from Telegram Bot
async function processTelegramMessage(message) {
  const chat_id = message.chat.id;
  const text = message.text;

  if (text === "/start") {
    let keyboard = {
      inline_keyboard: [[{ text: "馃摵 View Channels", callback_data: "channels_0" }]],
    };
    await sendMessage(chat_id, "Welcome! Choose an option:", keyboard);
  } else {
    await searchChannel(chat_id, text);
  }
}

// Process button clicks in Telegram
async function processCallbackQuery(query) {
  const chat_id = query.message.chat.id;
  const data = query.data;

  if (data.startsWith("channels_")) {
    let page = parseInt(data.split("_")[1]);
    await listChannels(chat_id, page);
  } else if (data.startsWith("play_")) {
    let id = parseInt(data.split("_")[1]);
    await playChannel(chat_id, id);
  }
}

// Send a message to Telegram
async function sendMessage(chat_id, text, keyboard = null) {
  let payload = {
    chat_id,
    text,
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  };

  if (keyboard) payload.reply_markup = keyboard;

  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// List channels with pagination
async function listChannels(chat_id, page) {
  let channels = await fetchChannels();
  if (channels.length === 0) {
    await sendMessage(chat_id, "鉂� No channels found. Please try again later.");
    return;
  }

  let start = page * CHANNELS_PER_PAGE;
  let end = start + CHANNELS_PER_PAGE;
  let paginatedChannels = channels.slice(start, end);

  let keyboard = paginatedChannels.map((channel, index) => [
    { text: `鈻� ${channel.name}`, callback_data: `play_${start + index}` },
  ]);

  let navigation = [];
  if (start > 0) navigation.push({ text: "猬� Previous", callback_data: `channels_${page - 1}` });
  if (end < channels.length) navigation.push({ text: "Next 鉃�", callback_data: `channels_${page + 1}` });
  if (navigation.length) keyboard.push(navigation);

  await sendMessage(chat_id, "馃摵 Select a channel to play:", { inline_keyboard: keyboard });
}

// Search for a channel
async function searchChannel(chat_id, query) {
  let channels = await fetchChannels();
  let results = channels.filter(channel =>
    channel.name.toLowerCase().includes(query.toLowerCase())
  );

  if (results.length === 0) {
    await sendMessage(chat_id, `鉂� No channels found for: \`${query}\``);
    return;
  }

  let keyboard = results.map((channel, index) => [{ text: `鈻� ${channel.name}`, callback_data: `play_${index}` }]);
  await sendMessage(chat_id, `馃攷 **Search Results for:** \`${query}\``, { inline_keyboard: keyboard });
}

// Play a channel inside Telegram
async function playChannel(chat_id, id) {
  let channels = await fetchChannels();
  if (id >= 0 && id < channels.length) {
    let channel = channels[id];

    if (channel.url.endsWith(".mp4")) {
      await fetch(`${TELEGRAM_API}/sendVideo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id,
          video: channel.url,
          caption: `馃幀 Now Playing: ${channel.name}`,
          supports_streaming: true,
        }),
      });
    } else {
      let webPlayerLink = `https://videojs-http-streaming.netlify.app/?src=${channel.url}`;
      let message = `馃幀 **Now Playing:** ${channel.name}\n\n鈻� **[Watch on Web Player](${webPlayerLink})**\n\n馃摬 **Open in VLC/MX Player:**\n- VLC: \`vlc://${channel.url}\`\n- MX Player: \`intent:${channel.url}#Intent;package=com.mxtech.videoplayer.ad;type=video/*;end\``;
      await sendMessage(chat_id, message);
    }
  } else {
    await sendMessage(chat_id, "鉂� Invalid channel selection.");
  }
}
