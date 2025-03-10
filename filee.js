const BOT_TOKEN = "8049379557:AAFTFfol-zFUxQDMCGypVwAHRsd6vl0oNqs";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const M3U_URL = "http://mu3241218.oknirvana.club:8880/get.php?username=D12m1040&password=84227782&type=m3u_plus";
const CHANNELS_PER_PAGE = 5;

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

// Fetch and parse M3U playlist
async function fetchChannels() {
  try {
    const response = await fetch(M3U_URL);
    if (!response.ok) {
      console.error("Failed to fetch M3U playlist:", response.status);
      return [];
    }

    const content = await response.text();
    console.log("Fetched M3U Content:", content); // Debugging

    const regex = /#EXTINF.*?,\s*(.*?)\s*\n(http[^\s]+)/g;
    let match;
    let channels = [];

    while ((match = regex.exec(content)) !== null) {
      channels.push({ name: match[1].trim(), url: match[2].trim() });
    }

    console.log("Extracted Channels:", channels); // Debugging
    return channels;
  } catch (error) {
    console.error("Error fetching M3U:", error);
    return [];
  }
}

// Handle incoming Telegram messages
async function handleRequest(request) {
  if (request.method !== "POST") {
    return new Response("Invalid request", { status: 400 });
  }

  try {
    const update = await request.json();
    console.log("Received Telegram update:", JSON.stringify(update));

    if (update.message) {
      await processTelegramMessage(update.message);
    } else if (update.callback_query) {
      await processCallbackQuery(update.callback_query);
    } else {
      console.warn("Unknown update format:", update);
    }

    return new Response("OK");
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response("Invalid JSON", { status: 400 });
  }
}

// Process commands from Telegram Bot
async function processTelegramMessage(message) {
  const chat_id = message.chat.id;
  const text = message.text;

  if (text === "/start") {
    let keyboard = {
      inline_keyboard: [[{ text: "📺 View Channels", callback_data: "channels_0" }]],
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
    await sendMessage(chat_id, "❌ No channels available.");
    return;
  }

  let start = page * CHANNELS_PER_PAGE;
  let end = start + CHANNELS_PER_PAGE;
  let paginatedChannels = channels.slice(start, end);

  let keyboard = paginatedChannels.map((channel, index) => [
    { text: `▶ ${channel.name}`, callback_data: `play_${start + index}` },
  ]);

  let navigation = [];
  if (start > 0) navigation.push({ text: "⬅ Previous", callback_data: `channels_${page - 1}` });
  if (end < channels.length) navigation.push({ text: "Next ➡", callback_data: `channels_${page + 1}` });
  if (navigation.length) keyboard.push(navigation);

  await sendMessage(chat_id, "📺 Select a channel to play:", { inline_keyboard: keyboard });
}

// Search for a channel
async function searchChannel(chat_id, query) {
  let channels = await fetchChannels();
  let results = channels.filter((channel) => channel.name.toLowerCase().includes(query.toLowerCase()));

  if (results.length === 0) {
    await sendMessage(chat_id, `❌ No channels found for: \`${query}\``);
    return;
  }

  let keyboard = results.map((channel, index) => [{ text: `▶ ${channel.name}`, callback_data: `play_${index}` }]);
  await sendMessage(chat_id, `🔎 **Search Results for:** \`${query}\``, { inline_keyboard: keyboard });
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
          caption: `🎬 Now Playing: ${channel.name}`,
          supports_streaming: true,
        }),
      });
    } else {
      let webPlayerLink = `https://videojs-http-streaming.netlify.app/?src=${channel.url}`;
      let message = `🎬 **Now Playing:** ${channel.name}\n\n▶ **[Watch on Web Player](${webPlayerLink})**\n\n📲 **Open in VLC/MX Player:**\n- VLC: \`vlc://${channel.url}\`\n- MX Player: \`intent:${channel.url}#Intent;package=com.mxtech.videoplayer.ad;type=video/*;end\``;
      await sendMessage(chat_id, message);
    }
  } else {
    await sendMessage(chat_id, "❌ Invalid channel selection.");
  }
}
