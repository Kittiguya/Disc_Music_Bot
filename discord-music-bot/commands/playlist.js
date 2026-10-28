const { EmbedBuilder } = require('discord.js');
const pl = require('../utils/playlists');
const { resolve } = require('../utils/resolver');
const MusicQueue = require('../utils/MusicQueue');

/**
 * !playlist save <name>        — saves current queue as a playlist
 * !playlist load <name>        — loads playlist into queue (respects current sort)
 * !playlist add <name> <query> — adds a song/URL to a saved playlist
 * !playlist delete <name>      — deletes a saved playlist
 * !playlist list               — lists all saved playlists
 * !playlist view <name>        — shows tracks in a playlist
 * !playlist sort <name> abc|artist|random  — sorts a saved playlist
 */
module.exports = {
  name: 'playlist',
  aliases: ['pl'],
  description: 'Manage saved playlists.',

  async execute(message, args, client) {
    const sub = args.shift()?.toLowerCase();

    // ── list ──────────────────────────────────────────────────────────────────
    if (!sub || sub === 'list') {
      const names = pl.listPlaylists(message.guild.id);
      if (!names.length) return message.reply('📭 No saved playlists yet. Use `!playlist save <name>` while songs are queued.');
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('📚 Saved Playlists')
        .setDescription(names.map((n, i) => {
          const p = pl.getPlaylist(message.guild.id, n);
          return `\`${i + 1}.\` **${p.name}** — ${p.tracks.length} tracks`;
        }).join('\n'));
      return message.reply({ embeds: [embed] });
    }

    // ── save ──────────────────────────────────────────────────────────────────
    if (sub === 'save') {
      const name = args.join(' ');
      if (!name) return message.reply('❌ Provide a name: `!playlist save <name>`');
      const queue = client.queues.get(message.guild.id);
      const allTracks = [];
      if (queue?.current) allTracks.push(queue.current);
      if (queue?.tracks?.length) allTracks.push(...queue.tracks);
      if (!allTracks.length) return message.reply('❌ Nothing in the queue to save.');
      pl.savePlaylist(message.guild.id, name, allTracks);
      return message.reply(`✅ Saved **${allTracks.length} tracks** as playlist **"${name}"**.`);
    }

    // ── load ──────────────────────────────────────────────────────────────────
    if (sub === 'load') {
      const nameInput = args.join(' ');
      if (!nameInput) return message.reply('❌ Provide a name: `!playlist load <name>`');
      const saved = pl.getPlaylist(message.guild.id, nameInput);
      if (!saved) return message.reply(`❌ No playlist named **"${nameInput}"**. Use \`!playlist list\` to see saved playlists.`);

      const voiceChannel = message.member?.voice?.channel;
      if (!voiceChannel) return message.reply('❌ Join a voice channel first!');

      let queue = client.queues.get(message.guild.id);
      if (!queue) {
        queue = new MusicQueue(message.guild, message.channel);
        client.queues.set(message.guild.id, queue);
        await queue.join(voiceChannel);
      }

      const tracks = [...saved.tracks]; // copy so we don't mutate saved data
      await queue.addTracks(tracks);

      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('📋 Playlist Loaded')
        .setDescription(`**${saved.name}** — ${tracks.length} tracks added to queue.`)
        .setFooter({ text: 'Tip: use !sort random/abc/artist to reorder before playing' });
      return message.reply({ embeds: [embed] });
    }

    // ── add ───────────────────────────────────────────────────────────────────
    if (sub === 'add') {
      // !playlist add <playlistname> | <song query>
      // We use | as a separator so playlist names can have spaces
      const full = args.join(' ');
      const sep = full.indexOf('|');
      if (sep === -1) return message.reply('❌ Format: `!playlist add <playlist name> | <song or URL>`\nExample: `!playlist add Gaming Mix | Linkin Park Numb`');
      const name = full.slice(0, sep).trim();
      const query = full.slice(sep + 1).trim();
      if (!name || !query) return message.reply('❌ Both playlist name and song are required.');

      const status = await message.reply(`🔍 Finding **${query}**...`);
      try {
        const { tracks } = await resolve(query, message.author.username);
        const total = pl.addToPlaylist(message.guild.id, name, tracks);
        await status.edit(`✅ Added **${tracks[0].title}** to **"${name}"**. Playlist now has **${total} tracks**.`);
      } catch (err) {
        await status.edit(`❌ ${err.message}`);
      }
      return;
    }

    // ── delete ────────────────────────────────────────────────────────────────
    if (sub === 'delete' || sub === 'remove') {
      const name = args.join(' ');
      if (!name) return message.reply('❌ Provide a name: `!playlist delete <name>`');
      const ok = pl.deletePlaylist(message.guild.id, name);
      return message.reply(ok ? `🗑️ Deleted playlist **"${name}"**.` : `❌ No playlist named **"${name}"**.`);
    }

    // ── view ──────────────────────────────────────────────────────────────────
    if (sub === 'view' || sub === 'show') {
      const nameInput = args.join(' ');
      if (!nameInput) return message.reply('❌ Provide a name: `!playlist view <name>`');
      const saved = pl.getPlaylist(message.guild.id, nameInput);
      if (!saved) return message.reply(`❌ No playlist named **"${nameInput}"**.`);

      const lines = saved.tracks.slice(0, 20).map((t, i) =>
        `\`${i + 1}.\` **${t.title}**${t.artist ? ` — ${t.artist}` : ''} \`${t.duration || '?'}\``
      );
      if (saved.tracks.length > 20) lines.push(`\n*...and ${saved.tracks.length - 20} more*`);

      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle(`📋 ${saved.name}`)
        .setDescription(lines.join('\n') || 'Empty playlist.')
        .setFooter({ text: `${saved.tracks.length} total tracks` });
      return message.reply({ embeds: [embed] });
    }

    // ── sort (saved playlist) ─────────────────────────────────────────────────
    if (sub === 'sort') {
      const mode = args.shift()?.toLowerCase();
      const name = args.join(' ');
      if (!mode || !name) return message.reply('❌ Format: `!playlist sort <abc|artist|random> <playlist name>`');
      const saved = pl.getPlaylist(message.guild.id, name);
      if (!saved) return message.reply(`❌ No playlist named **"${name}"**.`);

      if (mode === 'abc') {
        saved.tracks.sort((a, b) => a.title.localeCompare(b.title));
      } else if (mode === 'artist') {
        saved.tracks.sort((a, b) => (a.artist || a.title).localeCompare(b.artist || b.title));
      } else if (mode === 'random') {
        for (let i = saved.tracks.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [saved.tracks[i], saved.tracks[j]] = [saved.tracks[j], saved.tracks[i]];
        }
      } else {
        return message.reply('❌ Sort modes: `abc`, `artist`, `random`');
      }

      pl.savePlaylist(message.guild.id, name, saved.tracks);
      return message.reply(`✅ Playlist **"${saved.name}"** sorted by **${mode}** and saved.`);
    }

    // Unknown subcommand
    message.reply([
      '**Playlist commands:**',
      '`!playlist list` — see all playlists',
      '`!playlist save <name>` — save current queue',
      '`!playlist load <name>` — load into queue',
      '`!playlist add <name> | <song>` — add a song',
      '`!playlist view <name>` — see tracks',
      '`!playlist delete <name>` — delete it',
      '`!playlist sort <abc|artist|random> <name>` — sort a saved playlist',
    ].join('\n'));
  },
};
