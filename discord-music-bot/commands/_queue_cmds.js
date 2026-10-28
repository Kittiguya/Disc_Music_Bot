const { EmbedBuilder } = require('discord.js');

function getQueue(message, client, requirePlaying = true) {
  const queue = client.queues.get(message.guild.id);
  if (!queue || (requirePlaying && !queue.current)) {
    message.reply('❌ Nothing is playing right now.').catch(() => {});
    return null;
  }
  return queue;
}

// ── !skip ─────────────────────────────────────────────────────────────────────
const skip = {
  name: 'skip',
  aliases: ['s', 'next'],
  description: 'Skip the current track.',
  async execute(message, args, client) {
    const queue = getQueue(message, client);
    if (!queue) return;
    queue.skip();
    message.react('⏭️').catch(() => {});
  },
};

// ── !stop ─────────────────────────────────────────────────────────────────────
const stop = {
  name: 'stop',
  aliases: ['leave', 'disconnect'],
  description: 'Stop music, clear the queue, and leave.',
  async execute(message, args, client) {
    const queue = client.queues.get(message.guild.id);
    if (!queue) return message.reply('❌ Not playing anything.');
    queue.destroy();
    message.react('🛑').catch(() => {});
  },
};

// ── !pause ────────────────────────────────────────────────────────────────────
const pause = {
  name: 'pause',
  description: 'Pause the current track.',
  async execute(message, args, client) {
    const queue = getQueue(message, client);
    if (!queue) return;
    queue.pause();
    message.react('⏸️').catch(() => {});
  },
};

// ── !resume ───────────────────────────────────────────────────────────────────
const resume = {
  name: 'resume',
  aliases: ['r', 'unpause'],
  description: 'Resume a paused track.',
  async execute(message, args, client) {
    const queue = getQueue(message, client);
    if (!queue) return;
    queue.resume();
    message.react('▶️').catch(() => {});
  },
};

// ── !nowplaying ───────────────────────────────────────────────────────────────
const nowplaying = {
  name: 'nowplaying',
  aliases: ['np', 'current'],
  description: 'Show what\'s currently playing.',
  async execute(message, args, client) {
    const queue = getQueue(message, client);
    if (!queue) return;
    const t = queue.current;
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('🎵 Now Playing')
      .setDescription(`**${t.title}**${t.artist ? `\nby **${t.artist}**` : ''}`)
      .addFields({ name: 'Duration', value: t.duration || '?', inline: true })
      .setThumbnail(t.thumbnail || null);
    message.reply({ embeds: [embed] });
  },
};

// ── !queue ────────────────────────────────────────────────────────────────────
const queue = {
  name: 'queue',
  aliases: ['q', 'list'],
  description: 'View the current queue.',
  async execute(message, args, client) {
    const q = client.queues.get(message.guild.id);
    if (!q || !q.current) return message.reply('❌ Nothing in the queue.');

    const perPage = 10;
    const page = Math.max(1, parseInt(args[0]) || 1);
    const start = (page - 1) * perPage;
    const slice = q.tracks.slice(start, start + perPage);
    const totalPages = Math.max(1, Math.ceil(q.tracks.length / perPage));

    const lines = [`**▶ ${q.current.title}**${q.current.artist ? ` — ${q.current.artist}` : ''} \`(now playing)\``];
    if (slice.length) {
      lines.push('');
      slice.forEach((t, i) => {
        lines.push(`\`${start + i + 1}.\` **${t.title}**${t.artist ? ` — ${t.artist}` : ''} \`${t.duration}\``);
      });
    } else {
      lines.push('\n*No more tracks queued.*');
    }

    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle(`📋 Queue — ${q.tracks.length} track(s) remaining`)
      .setDescription(lines.join('\n').substring(0, 4000))
      .setFooter({ text: `Page ${page}/${totalPages}` });
    message.reply({ embeds: [embed] });
  },
};

// ── !remove ───────────────────────────────────────────────────────────────────
const remove = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Remove a track from the queue by position. `!remove 3`',
  async execute(message, args, client) {
    const q = getQueue(message, client, false);
    if (!q) return message.reply('❌ No active queue.');
    const pos = parseInt(args[0]) - 1;
    if (isNaN(pos) || pos < 0 || pos >= q.tracks.length) {
      return message.reply(`❌ Give a position between 1 and ${q.tracks.length}.`);
    }
    const [removed] = q.tracks.splice(pos, 1);
    message.reply(`🗑️ Removed **${removed.title}** from the queue.`);
  },
};

// ── !sort ─────────────────────────────────────────────────────────────────────
const sort = {
  name: 'sort',
  description: 'Sort the queue. `!sort abc` | `!sort artist` | `!sort random`',
  async execute(message, args, client) {
    const q = getQueue(message, client, false);
    if (!q) return message.reply('❌ No active queue.');
    if (!q.tracks.length) return message.reply('❌ Queue is empty.');

    const mode = args[0]?.toLowerCase();

    if (mode === 'abc' || mode === 'title') {
      q.tracks.sort((a, b) => a.title.localeCompare(b.title));
      message.reply('🔤 Queue sorted **A → Z** by title.');
    } else if (mode === 'artist') {
      q.tracks.sort((a, b) => {
        const artistA = a.artist || a.title;
        const artistB = b.artist || b.title;
        return artistA.localeCompare(artistB);
      });
      message.reply('🎤 Queue sorted **A → Z** by artist.');
    } else if (mode === 'random' || mode === 'shuffle') {
      for (let i = q.tracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [q.tracks[i], q.tracks[j]] = [q.tracks[j], q.tracks[i]];
      }
      message.reply(`🔀 Queue shuffled! (${q.tracks.length} tracks)`);
    } else {
      message.reply('**Sort options:**\n`!sort abc` — alphabetical by title\n`!sort artist` — alphabetical by artist\n`!sort random` — shuffle randomly');
    }
  },
};

// ── !loop ─────────────────────────────────────────────────────────────────────
const loop = {
  name: 'loop',
  description: 'Toggle loop. `!loop track` | `!loop queue` | `!loop off`',
  async execute(message, args, client) {
    const q = getQueue(message, client);
    if (!q) return;
    const mode = args[0]?.toLowerCase();
    if (mode === 'track') {
      q.loop = true; q.loopQueue = false;
      message.reply('🔂 Looping this track.');
    } else if (mode === 'queue') {
      q.loopQueue = true; q.loop = false;
      message.reply('🔁 Looping the full queue.');
    } else {
      q.loop = false; q.loopQueue = false;
      message.reply('➡️ Loop off.');
    }
  },
};

module.exports = { skip, stop, pause, resume, nowplaying, queue, remove, sort, loop };
