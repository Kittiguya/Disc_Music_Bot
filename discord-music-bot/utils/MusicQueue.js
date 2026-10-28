const {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  joinVoiceChannel,
  StreamType,
} = require('@discordjs/voice');
const { EmbedBuilder } = require('discord.js');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const YTDLP  = path.join(__dirname, '..', 'yt-dlp.exe');
const FFMPEG = path.join(__dirname, '..', 'ffmpeg.exe');

const MUSIC_DIR = process.env.MUSIC_DIR
  ? path.resolve(process.env.MUSIC_DIR)
  : path.join(__dirname, '..', 'music');

const LOCAL_EXTS = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.opus', '.webm'];

function isLocalFile(input) {
  if (!input) return false;
  const ext = path.extname(input).toLowerCase();
  if (LOCAL_EXTS.includes(ext)) return true;
  return fs.existsSync(input);
}

function resolveLocalPath(input) {
  if (path.isAbsolute(input) && fs.existsSync(input)) return input;
  const inMusic = path.join(MUSIC_DIR, input);
  if (fs.existsSync(inMusic)) return inMusic;
  return null;
}

function streamWithYtdlp(url) {
  const proc = spawn(YTDLP, [
    '--no-playlist',
    '-f', 'bestaudio[ext=webm]/bestaudio/best',
    '--no-warnings',
    '-o', '-',
    url,
  ], { stdio: ['ignore', 'pipe', 'ignore'] });
  return { stream: proc.stdout, proc };
}

function streamLocalFile(filePath) {
  const proc = spawn(FFMPEG, [
    '-i', filePath,
    '-analyzeduration', '0',
    '-loglevel', 'error',
    '-f', 'opus',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  proc.stderr.on('data', d => console.error('[ffmpeg]', d.toString().trim()));
  proc.on('error', err => console.error('[ffmpeg error]', err.message));

  return { stream: proc.stdout, proc };
}

class MusicQueue {
  constructor(guild, textChannel) {
    this.guild = guild;
    this.textChannel = textChannel;
    this.voiceChannel = null;
    this.connection = null;
    this.player = createAudioPlayer();
    this.tracks = [];
    this.current = null;
    this.loop = false;
    this.loopQueue = false;
    this._idleTimer = null;
    this._activeProc = null;
    this._paused = false;

    this.player.on(AudioPlayerStatus.Idle, () => {
      if (this.loop && this.current) this.tracks.unshift(this.current);
      else if (this.loopQueue && this.current) this.tracks.push(this.current);
      this._paused = false;
      this.playNext();
    });

    this.player.on('error', (err) => {
      console.error('[Player Error]', err.message);
      this.textChannel.send(`❌ Playback error on **${this.current?.title || 'track'}**, skipping...`).catch(() => {});
      this._killProc();
      this.playNext();
    });
  }

  _broadcast() {
    try {
      if (typeof global.guiBroadcast === 'function') {
        global.guiBroadcast({
          type: 'state',
          paused: this._paused,
          current: this.current ? {
            title: this.current.title,
            artist: this.current.artist || null,
            duration: this.current.duration || '?',
            requestedBy: this.current.requestedBy || '?',
            thumbnail: this.current.thumbnail || null,
            isLocal: this.current.isLocal || false,
          } : null,
          queue: this.tracks.map(t => ({
            title: t.title,
            artist: t.artist || null,
            duration: t.duration || '?',
            requestedBy: t.requestedBy || '?',
            isLocal: t.isLocal || false,
          })),
        });
      }
    } catch {}
  }

  _killProc() {
    try { this._activeProc?.kill(); } catch {}
    this._activeProc = null;
  }

  async join(voiceChannel) {
    this.voiceChannel = voiceChannel;
    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });
    await entersState(this.connection, VoiceConnectionStatus.Ready, 30_000);
    this.connection.subscribe(this.player);
    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch { this.destroy(); }
    });
  }

  async addTrack(track) {
    this.tracks.push(track);
    this._broadcast();
    if (this.player.state.status === AudioPlayerStatus.Idle && !this.current) await this.playNext();
  }

  async addTracks(trackList) {
    this.tracks.push(...trackList);
    this._broadcast();
    if (this.player.state.status === AudioPlayerStatus.Idle && !this.current) await this.playNext();
  }

  async playNext() {
    if (this._idleTimer) { clearTimeout(this._idleTimer); this._idleTimer = null; }

    if (this.tracks.length === 0) {
      this.current = null;
      this._paused = false;
      setTimeout(() => { if (!this.current) this._broadcast(); }, 1500);
      this._idleTimer = setTimeout(() => {
        this.textChannel.send('👋 Queue finished, leaving voice channel.').catch(() => {});
        this.destroy();
      }, 5 * 60 * 1000);
      return;
    }

    this.current = this.tracks.shift();
    this._paused = false;
    this._broadcast();

    try {
      this._killProc();

      if (this.current.isLocal) {
        const filePath = resolveLocalPath(this.current.filePath || this.current.url);
        if (!filePath) throw new Error(`Local file not found: ${this.current.title}`);

        const streamResult = streamLocalFile(filePath);
        this._activeProc = streamResult.proc;

        const resource = createAudioResource(streamResult.stream, {
          inputType: StreamType.OggOpus,
          inlineVolume: true,
        });
        resource.volume.setVolume(0.5);
        this.player.play(resource);

      } else {
        let streamUrl = this.current.url;
        if (!streamUrl) {
          const play = require('play-dl');
          const results = await play.search(`${this.current.title} ${this.current.artist || ''}`, { limit: 1 });
          if (!results.length) throw new Error('Could not find on YouTube');
          streamUrl = results[0].url;
          this.current.url = streamUrl;
        }
        const streamResult = streamWithYtdlp(streamUrl);
        this._activeProc = streamResult.proc;

        const resource = createAudioResource(streamResult.stream, { inlineVolume: true });
        resource.volume.setVolume(0.5);
        this.player.play(resource);
      }

      const embed = new EmbedBuilder()
        .setColor(this.current.isLocal ? 0x9d5cf6 : 0xFF0000)
        .setTitle(this.current.isLocal ? '🎵 Now Playing (Local)' : '🎵 Now Playing')
        .setDescription(`**${this.current.title}**${this.current.artist ? `\nby **${this.current.artist}**` : ''}`)
        .addFields(
          { name: 'Duration',  value: this.current.duration  || '?', inline: true },
          { name: 'In Queue',  value: `${this.tracks.length} track(s)`, inline: true },
          { name: 'Queued by', value: this.current.requestedBy || '?', inline: true },
        );

      if (!this.current.isLocal && this.current.thumbnail) embed.setThumbnail(this.current.thumbnail);
      if (this.loop) embed.setFooter({ text: '🔂 Looping this track' });
      else if (this.loopQueue) embed.setFooter({ text: '🔁 Looping queue' });

      this.textChannel.send({ embeds: [embed] }).catch(() => {});

    } catch (err) {
      console.error('[playNext error]', err.message);
      this.textChannel.send(`❌ Couldn't play **${this.current.title}**: ${err.message}`).catch(() => {});
      this.current = null;
      this._broadcast();
      this.playNext();
    }
  }

  skip()   { this._killProc(); this.player.stop(); }

  pause() {
    const ok = this.player.pause();
    if (ok) { this._paused = true; this._broadcast(); }
    return ok;
  }

  resume() {
    const ok = this.player.unpause();
    if (ok) { this._paused = false; this._broadcast(); }
    return ok;
  }

  destroy() {
    this.tracks = [];
    this.current = null;
    this._paused = false;
    this._broadcast();
    this._killProc();
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this.player.stop(true);
    try { this.connection?.destroy(); } catch {}
    this.guild.client.queues.delete(this.guild.id);
  }

  static getMusicDir()  { return MUSIC_DIR; }
  static isLocalFile(i) { return isLocalFile(i); }
  static getLocalExts() { return LOCAL_EXTS; }
}

module.exports = MusicQueue;
