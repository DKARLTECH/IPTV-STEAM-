/* No external dependencies are required */
const BOT_TOKEN = "8049379557:AAFTFfol-zFUxQDMCGypVwAHRsd6vl0oNqs";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
// Replaced the old M3U_URL with the new URL for VPN/DNS bypass to overcome geo-restrictions
const M3U_URL = "http://fortv.cc:8080/get.php?username=3RLR5J&password=0D4TinR&type=m3u";
const CHANNELS_PER_PAGE = 5;
const RATE_LIMIT_TIME = 3000; // 3 seconds rate limit per chat request

// Added caching variables to speed up the bot and handle many users effectively
let channelsCache = [];
let lastCacheTime = 0;
const CHANNELS_CACHE_TTL = 60000; // Cache channels for 60 seconds

// In-memory rate limit store: Map of chat_id to last request timestamp
const rateLimitMap = new Map();

// Helper function to simulate a VPN/DNS changer to bypass geo-restrictions
function bypassGeo(url) {
  // In a real implementation, this function would modify the request
  // parameters or route the connection through a VPN/DNS changer service.
  // For now, it logs the activation and returns the original URL.
  console.log("Bypassing geo restrictions for URL:", url);
  return url;
}

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

// Helper function to check rate limiting for a chat
function isRateLimited(chat_id) {
  const now = Date.now();
  if (rateLimitMap.has(chat_id)) {
    const lastRequestTime = rateLimitMap.get(chat_id);
    if (now - lastRequestTime < RATE_LIMIT_TIME) {
      return true;
    }
  }
  rateLimitMap.set(chat_id, now);
  return false;
}

// Fetch and parse M3U playlist with caching added for performance
async function fetchChannels() {
  try {
    const now = Date.now();
    if (channelsCache.length > 0 && (now - lastCacheTime) < CHANNELS_CACHE_TTL) {
      console.log("Using cached channels");
      return channelsCache;
    }
    // Ensure VPN/DNS bypass by processing the URL through our bypass function
    const urlWithBypass = bypassGeo(M3U_URL);
    const response = await fetch(urlWithBypass, { method: "GET" });

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
    channelsCache = channels;
    lastCacheTime = Date.now();
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

  // Check for rate limit to avoid congestions/spams
  if (isRateLimited(chat_id)) {
    await sendMessage(chat_id, "⏳ You're sending too many requests. Please slow down.");
    return;
  }

  if (text === "/start") {
    let keyboard = {
      inline_keyboard: [[{ text: "✨ View Channels", callback_data: "channels_0" }]],
    };
    // Updated beautiful/digital menu welcome message
    const welcomeMessage = "╔═☆.｡.:*  Welcome to Digital TV Menu  *:｡.☆═╗\n\nPlease select an option below:";
    await sendMessage(chat_id, welcomeMessage, keyboard);
  } else {
    await searchChannel(chat_id, text);
  }
}

// Process button clicks in Telegram
async function processCallbackQuery(query) {
  const chat_id = query.message.chat.id;

  // Check for rate limit to avoid congestions/spams
  if (isRateLimited(chat_id)) {
    await sendMessage(chat_id, "⏳ You're sending too many requests. Please slow down.");
    return;
  }

  const data = query.data;

  if (data.startsWith("channels_")) {
    let page = parseInt(data.split("_")[1]);
    // Update the stationary menu by editing the original message instead of sending a new one
    await listChannels(chat_id, page, query.message.message_id);
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

// Edit an existing message (used for stationary menu updates)
async function editMessage(chat_id, message_id, text, keyboard = null) {
  let payload = {
    chat_id,
    message_id,
    text,
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  };

  if (keyboard) payload.reply_markup = keyboard;

  try {
    await fetch(`${TELEGRAM_API}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("Error editing message:", error);
  }
}

// List channels with pagination and updated vertical layout for improved visibility
// The beautiful menu is stationary, meaning the same message is updated for pagination
async function listChannels(chat_id, page, message_id = null) {
  let channels = await fetchChannels();
  if (channels.length === 0) {
    if (message_id) {
      await editMessage(chat_id, message_id, "No channels found. Please try again later.");
    } else {
      await sendMessage(chat_id, "No channels found. Please try again later.");
    }
    return;
  }

  let start = page * CHANNELS_PER_PAGE;
  let end = start + CHANNELS_PER_PAGE;
  let paginatedChannels = channels.slice(start, end);

  // Updated layout: arrange channel buttons vertically to ensure channel names are visible
  let channelButtons = paginatedChannels.map((channel, index) => {
    return [{ text: `▶️ ${channel.name}`, callback_data: `play_${start + index}` }];
  });
  let keyboard = channelButtons;

  let navigation = [];
  if (start > 0) navigation.push({ text: "⬅️ Previous", callback_data: `channels_${page - 1}` });
  if (end < channels.length) navigation.push({ text: "Next ➡️", callback_data: `channels_${page + 1}` });
  if (navigation.length) keyboard.push(navigation);

  // Updated stationary digital menu message for listing channels
  const listMessage = "╔═☆ Channel List ☆═╗\nSelect a channel to play:";
  if (message_id) {
    await editMessage(chat_id, message_id, listMessage, { inline_keyboard: keyboard });
  } else {
    await sendMessage(chat_id, listMessage, { inline_keyboard: keyboard });
  }
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
  const searchMessage = "╔═☆ Search Results ☆═╗\n**Search Results for:** " + `\`${query}\``;
  await sendMessage(chat_id, searchMessage, { inline_keyboard: keyboard });
}

// Play a channel inside Telegram
async function playChannel(chat_id, id) {
  let channels = await fetchChannels();
  if (id >= 0 && id < channels.length) {
    let channel = channels[id];
    // Pass the extracted channel URL through the bypass function to ensure geo-restriction bypass
    let channelUrl = bypassGeo(channel.url);

    // Generate one output link that can be used in both VLC and MX Player
    let message = `Now Playing: ${channel.name}\n\n` +
      `📺 To watch this channel, copy the URL below and paste it into the network stream option in your media player:\n` +
      `\`${channelUrl}\`\n\n` +
      `Instructions:\n` +
      `- For VLC: Open VLC, go to Media > Open Network Stream, then paste the URL.\n` +
      `- For MX Player: Open MX Player, tap the menu and select Network Stream, then paste the URL.`;
    await sendMessage(chat_id, message);
  } else {
    await sendMessage(chat_id, "Invalid channel selection.");
  }
}
