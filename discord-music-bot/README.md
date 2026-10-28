# 🎵 Discord Music Bot — Setup Guide

A personal Discord music bot. Plays YouTube links, searches by song/artist name,
supports saved playlists with ABC / artist / random sorting.

---

## ⚙️ Step 1 — Install Node.js

Download from https://nodejs.org (LTS version, 18 or newer).

---

## 🤖 Step 2 — Create Your Discord Bot

1. Go to https://discord.com/developers/applications
2. Click **New Application** → give it a name (e.g. "My Music Bot")
3. Click **Bot** in the left sidebar
4. Click **Add Bot** → confirm

### Copy your token:
- Under **Token**, click **Reset Token**, confirm, then **Copy** it
- Paste it into your `.env` file (see Step 4)

### Enable required intents:
Scroll down to **Privileged Gateway Intents** and turn ON:
- ✅ **Message Content Intent**
- ✅ **Server Members Intent** (optional but good practice)

---

## 📨 Step 3 — Invite the Bot to Your Server

1. Still in the Developer Portal, click **OAuth2** → **URL Generator**
2. Under **Scopes**, check: `bot`
3. Under **Bot Permissions**, check:
   - ✅ Send Messages
   - ✅ Read Message History
   - ✅ Connect
   - ✅ Speak
   - ✅ Use Voice Activity
4. Copy the generated URL at the bottom → paste it in your browser → select your server → Authorize

---

## 📁 Step 4 — Configure the Bot

In the bot folder, copy `.env.example` to `.env`:

```
cp .env.example .env
```

Open `.env` and paste your bot token:
```
DISCORD_TOKEN=paste_your_token_here
```

---

## 📦 Step 5 — Install Dependencies

Open a terminal/command prompt in the bot folder and run:

```
npm install
```

---

## ▶️ Step 6 — Run the Bot

```
node index.js
```

You should see: `✅ Bot online as YourBotName#1234`

To keep it running while you game, just leave the terminal open.
You can also run it minimized — it uses almost no CPU when idle.

---

## 🎮 Commands

| Command | What it does |
|---|---|
| `!play Metallica Enter Sandman` | Search YouTube and play |
| `!play https://youtu.be/abc` | Play a YouTube video |
| `!play https://youtube.com/playlist?list=...` | Queue a YouTube playlist |
| `!pause` / `!resume` | Pause / resume |
| `!skip` | Skip current track |
| `!stop` | Stop and leave voice |
| `!nowplaying` | Show current track |
| `!queue` | See the queue |
| `!sort abc` | Sort queue A→Z by title |
| `!sort artist` | Sort queue A→Z by artist |
| `!sort random` | Shuffle the queue |
| `!loop track` | Loop the current track |
| `!loop queue` | Loop the full queue |
| `!remove 3` | Remove track #3 from queue |
| `!playlist save Gaming Mix` | Save current queue as a playlist |
| `!playlist load Gaming Mix` | Load that playlist |
| `!playlist add Gaming Mix \| Linkin Park Numb` | Add a song to a playlist |
| `!playlist sort random Gaming Mix` | Shuffle a saved playlist |
| `!playlist list` | See all saved playlists |
| `!playlist view Gaming Mix` | See tracks in a playlist |
| `!help` | Show all commands |

---

## 🔧 Troubleshooting

**Bot joins but plays no sound:**
- Make sure the bot has **Speak** permission in the voice channel
- Make sure you have **Use Voice Activity** enabled on the server

**"Could not find" errors:**
- YouTube occasionally blocks requests. Wait a minute and try again.
- Try being more specific: `!play Metallica - Enter Sandman (Official)`

**Bot goes offline:**
- The terminal window was closed. Re-run `node index.js`.
- For 24/7 uptime, look into `pm2` (`npm install -g pm2` then `pm2 start index.js`)

---

## 💾 Playlists

Playlists are saved as JSON files in the `data/` folder inside the bot directory.
They persist between restarts. Back up that folder to keep your playlists.
