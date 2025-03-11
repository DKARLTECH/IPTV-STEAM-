const BOT_TOKEN = "8049379557:AAFTFfol-zFUxQDMCGypVwAHRsd6vl0oNqs";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const M3U_URL = "https://www.sh365.org/iptv/p/yL5XFFau9D5Kqd/Sharavoz.Tv.m3u";
const CHANNELS_PER_PAGE = 5;

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

// Fetch and parse M3U playlist
async function fetchChannels() {
  try {
    const response = await fetch(M3U_URL, { method: "GET" });

    if (!response.ok) {
      console.error(`Failed to fetch M3U file, status: ${response.status}`);
      return [];
    }

    const content = await response.text();
    console.log("Fetched M3U Content:", content);

    const regex = /#EXTINF.*?,\s*(.*?)\s*\n(http[^\s]+)/g;
    let match;
    let channels = [];

    while ((match = regex.exec(content)) !== null) {
      channels.push({ name: match[1].trim(), url: match[2].trim() });
    }

    if (channels.length === 0) {
      console.log("No channels found in the M3U content.");
    }

    console.log("Extracted Channels:", channels);
    return channels;
  } catch (error) {
    console.error("Error fetching channels:", error);
    return [];
  }
}

// Handle incoming Telegram messages
async function handleRequest(request) {
  if (request.method === "POST") {
    let update;
    try {
      update = await request.json();
    } catch (error) {
      return new Response("Error parsing JSON", { status: 400 });
    }

    if (update.message) {
      await processTelegramMessage(update.message);
    } else if (update.callback_query) {
      await processCallbackQuery(update.callback_query);
    }
    return new Response("OK");
  }
  return new Response("Invalid request", { status: 400 });
}

// Process Telegram commands
async function processTelegramMessage(message) {
  const chat_id = message.chat.id;
  const text = message.text;

  if (text === "/start") {
    let keyboard = {
      inline_keyboard: [[{ text: "View Channels", callback_data: "channels_0" }]],
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

  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("Error sending message:", error);
  }
}

// List channels with pagination
async function listChannels(chat_id, page) {
  let channels = await fetchChannels();
  if (channels.length === 0) {
    await sendMessage(chat_id, "No channels found. Please try again later.");
    return;
  }

  let start = page * CHANNELS_PER_PAGE;
  let end = start + CHANNELS_PER_PAGE;
  let paginatedChannels = channels.slice(start, end);

  let keyboard = paginatedChannels.map((channel, index) => [
    { text: `▶️ ${channel.name}`, callback_data: `play_${start + index}` },
  ]);

  let navigation = [];
  if (start > 0) navigation.push({ text: "Previous ⬅️", callback_data: `channels_${page - 1}` });
  if (end < channels.length) navigation.push({ text: "Next ➡️", callback_data: `channels_${page + 1}` });
  if (navigation.length) keyboard.push(navigation);

  await sendMessage(chat_id, "Select a channel to play:", { inline_keyboard: keyboard });
}

// Search for a channel
async function searchChannel(chat_id, query) {
  let channels = await fetchChannels();
  let results = channels.filter(channel =>
    channel.name.toLowerCase().includes(query.toLowerCase())
  );

  if (results.length === 0) {
    await sendMessage(chat_id, `No channels found for: \`${query}\``);
    return;
  }

  let keyboard = results.map((channel, index) => [{ text: `▶️ ${channel.name}`, callback_data: `play_${index}` }]);
  await sendMessage(chat_id, `**Search Results for:** \`${query}\``, { inline_keyboard: keyboard });
}

// Play a channel inside Telegram
async function playChannel(chat_id, id) {
  let channels = await fetchChannels();
  if (id >= 0 && id < channels.length) {
    let channel = channels[id];

    if (channel.url.endsWith(".mp4")) {
      try {
        await fetch(`${TELEGRAM_API}/sendVideo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id,
            video: channel.url,
            caption: `Now Playing: ${channel.name}`,
            supports_streaming: true,
          }),
        });
      } catch (error) {
        console.error("Error sending video:", error);
      }
    } else {
      let webPlayerLink = `https://videojs-http-streaming.netlify.app/?src=${channel.url}`;
      let message = `Now Playing: ${channel.name}\n\n▶️ **[Watch on Web Player](${webPlayerLink})**\n\n📱 **Open in VLC/MX Player:**\n- VLC: \`vlc://${channel.url}\`\n- MX Player: \`intent:${channel.url}#Intent;package=com.mxtech.videoplayer.ad;type=video/*;end\``;
      await sendMessage(chat_id, message);
    }
  } else {
    await sendMessage(chat_id, "Invalid channel selection.");
  }
}
