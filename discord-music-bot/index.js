require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { readdirSync } = require('fs');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();
client.queues = new Map();

const commandFiles = readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const cmd = require(`./commands/${file}`);
  client.commands.set(cmd.name, cmd);
  if (cmd.aliases) cmd.aliases.forEach(a => client.commands.set(a, cmd));
}

// ── WebSocket server for GUI ──────────────────────────────────────────────────
const GUI_PORT = 3001;
const wss = new WebSocket.Server({ port: GUI_PORT });
const guiClients = new Set();

// Helper — get first active queue
function getActiveQueue() {
  for (const [, queue] of client.queues) {
    if (queue.voiceChannel) return queue;
  }
  return null;
}

wss.on('connection', (ws) => {
  guiClients.add(ws);

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      switch (msg.type) {

        // ── Playback controls from GUI ──────────────────────────────────────
        case 'pause': {
          const q = getActiveQueue();
          if (q) q.pause();
          break;
        }
        case 'resume': {
          const q = getActiveQueue();
          if (q) q.resume();
          break;
        }
        case 'skip': {
          const q = getActiveQueue();
          if (q) q.skip();
          break;
        }
        case 'stop': {
          const q = getActiveQueue();
          if (q) q.destroy();
          break;
        }

        // ── Play playlist from GUI ──────────────────────────────────────────
        case 'play-playlist': {
          const q = getActiveQueue();
          if (q && msg.tracks?.length) {
            await q.addTracks(msg.tracks);
            q.textChannel.send(`▶ Playing **${msg.tracks.length} tracks** from GUI playlist.`).catch(() => {});
          }
          break;
        }

        // ── Play local file from GUI ────────────────────────────────────────
        case 'play-local': {
          const q = getActiveQueue();
          if (q && msg.track) {
            await q.addTrack(msg.track);
          }
          break;
        }
      }
    } catch (e) {
      console.error('[WS message error]', e.message);
    }
  });

  ws.on('close', () => guiClients.delete(ws));
  ws.on('error', () => guiClients.delete(ws));
});

global.guiBroadcast = (data) => {
  const msg = JSON.stringify(data);
  for (const ws of guiClients) {
    try { if (ws.readyState === WebSocket.OPEN) ws.send(msg); } catch {}
  }
};

console.log(`[GUI Bridge] WebSocket server on port ${GUI_PORT}`);

// ── Bot events ────────────────────────────────────────────────────────────────
client.once('ready', () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
  client.user.setActivity('!play <song or link>', { type: 2 });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;
  const args = message.content.slice(1).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  const command = client.commands.get(commandName);
  if (!command) return;
  try {
    await command.execute(message, args, client);
  } catch (err) {
    console.error(`[ERROR] Command "${commandName}":`, err.message);
    message.reply(`❌ Error: ${err.message}`).catch(() => {});
  }
});

client.login(process.env.DISCORD_TOKEN);
