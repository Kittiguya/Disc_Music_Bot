const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'help',
  aliases: ['h', 'commands'],
  description: 'Show all commands.',

  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('🎵 Music Bot — Commands')
      .addFields(
        {
          name: '▶️ Playing Music',
          value: [
            '`!play <song name or artist>`',
            '`!play <YouTube URL>`',
            '`!play <YouTube playlist URL>`',
            '',
            'Examples:',
            '`!play Metallica Enter Sandman`',
            '`!play https://youtu.be/abc123`',
          ].join('\n'),
        },
        {
          name: '⏯️ Playback Controls',
          value: [
            '`!pause` — pause',
            '`!resume` — resume',
            '`!skip` — skip current track',
            '`!stop` — stop and leave',
            '`!nowplaying` — what\'s playing',
          ].join('\n'),
        },
        {
          name: '📋 Queue',
          value: [
            '`!queue` — see the queue',
            '`!remove <#>` — remove track by position',
            '`!sort abc` — sort A→Z by title',
            '`!sort artist` — sort A→Z by artist',
            '`!sort random` — shuffle queue',
            '`!loop track` — loop current track',
            '`!loop queue` — loop full queue',
            '`!loop off` — disable loop',
          ].join('\n'),
        },
        {
          name: '💾 Saved Playlists',
          value: [
            '`!playlist list` — see all your playlists',
            '`!playlist save <n>` — save current queue as playlist',
            '`!playlist load <n>` — load a playlist into queue',
            '`!playlist add <n> | <song>` — add song to playlist',
            '`!playlist view <n>` — see tracks in playlist',
            '`!playlist delete <n>` — delete a playlist',
            '`!playlist sort <abc|artist|random> <n>` — sort a playlist',
          ].join('\n'),
        },
      )
      .setFooter({ text: 'Aliases: p=play, s=skip, r=resume, q=queue, np=nowplaying, pl=playlist' });

    message.reply({ embeds: [embed] });
  },
};
