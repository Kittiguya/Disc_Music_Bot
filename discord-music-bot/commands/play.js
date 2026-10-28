const MusicQueue = require('../utils/MusicQueue');
const { resolve } = require('../utils/resolver');
const { EmbedBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

const LOCAL_EXTS = MusicQueue.getLocalExts();
const MUSIC_DIR  = MusicQueue.getMusicDir();

module.exports = {
  name: 'play',
  aliases: ['p'],
  description: 'Play a song. YouTube URL, search query, or local filename.',
  usage: '!play <YouTube URL | search query | filename.mp3>',

  async execute(message, args, client) {
    if (!args.length) {
      return message.reply('❌ Tell me what to play!\n`!play Metallica Master of Puppets`\n`!play song.mp3`\n`!play https://youtu.be/...`');
    }

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) return message.reply('❌ You need to be in a voice channel first!');

    const perms = voiceChannel.permissionsFor(message.client.user);
    if (!perms?.has('Connect') || !perms?.has('Speak')) {
      return message.reply('❌ I need **Connect** and **Speak** permissions in that voice channel.');
    }

    const query = args.join(' ');
    const ext = path.extname(query).toLowerCase();
    const isLocal = LOCAL_EXTS.includes(ext) || fs.existsSync(query);

    const status = await message.reply(isLocal ? '📁 Loading local file...' : '🔍 Finding that...');

    try {
      let tracks, isPlaylist = false, playlistName = null;

      if (isLocal) {
        // ── Local file ──────────────────────────────────────────────────────
        // Check in MUSIC_DIR first, then absolute path
        let filePath = path.isAbsolute(query) && fs.existsSync(query)
          ? query
          : path.join(MUSIC_DIR, query);

        if (!fs.existsSync(filePath)) {
          await status.edit(`❌ Could not find file: \`${query}\`\nMake sure it's in your music folder.`);
          return;
        }

        const title = path.basename(query, ext);
        tracks = [{
          title,
          artist: null,
          url: filePath,
          filePath,
          duration: '?',
          thumbnail: null,
          isLocal: true,
          requestedBy: message.author.username,
        }];
      } else {
        // ── YouTube / search ────────────────────────────────────────────────
        const result = await resolve(query, message.author.username);
        tracks = result.tracks;
        isPlaylist = result.isPlaylist;
        playlistName = result.playlistName;
      }

      // Get or create queue
      let queue = client.queues.get(message.guild.id);
      if (!queue) {
        queue = new MusicQueue(message.guild, message.channel);
        client.queues.set(message.guild.id, queue);
        await queue.join(voiceChannel);
      } else if (queue.voiceChannel?.id !== voiceChannel.id) {
        await queue.join(voiceChannel);
      }

      if (isPlaylist) {
        await queue.addTracks(tracks);
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('📋 Playlist Queued')
          .setDescription(`Added **${tracks.length} tracks** from **${playlistName || 'playlist'}**`);
        await status.edit({ content: '', embeds: [embed] });
      } else {
        const track = tracks[0];
        const wasEmpty = !queue.current && queue.tracks.length === 0;
        await queue.addTrack(track);
        if (!wasEmpty) {
          const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('➕ Added to Queue')
            .setDescription(`**${track.title}**${track.artist ? ` — ${track.artist}` : ''}${track.isLocal ? ' 📁' : ''}`)
            .addFields({ name: 'Position', value: `#${queue.tracks.length + 1}`, inline: true });
          await status.edit({ content: '', embeds: [embed] });
        } else {
          await status.delete().catch(() => {});
        }
      }
    } catch (err) {
      console.error('[play error]', err.message);
      await status.edit(`❌ ${err.message}`);
    }
  },
};
