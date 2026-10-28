const play = require('play-dl');


async function resolve(input, requestedBy = 'Unknown') {
  input = input.trim();


  if ((input.includes('youtube.com') || input.includes('youtu.be')) && input.includes('list=')) {
    const playlist = await play.playlist_info(input, { incomplete: true });
    const videos = await playlist.all_videos();
    const tracks = videos.map(v => formatYT(v, requestedBy));
    return { tracks, isPlaylist: true, playlistName: playlist.title };
  }


  if (input.includes('youtube.com/watch') || input.includes('youtu.be/')) {
    const info = await play.video_info(input);
    return { tracks: [formatYT(info.video_details, requestedBy)], isPlaylist: false, playlistName: null };
  }

 
  const results = await play.search(input, { limit: 1 });
  if (!results.length) throw new Error(`No results found for: "${input}"`);
  return { tracks: [formatYT(results[0], requestedBy)], isPlaylist: false, playlistName: null };
}

function formatYT(video, requestedBy) {
  let title = video.title || 'Unknown';
  let artist = null;

  const dashMatch = title.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) {
    artist = dashMatch[1].trim();
    title = dashMatch[2].trim();
  }

  return {
    title,
    artist,
    url: video.url,
    duration: video.durationRaw || '?',
    thumbnail: video.thumbnails?.[0]?.url || null,
    requestedBy,
  };
}

module.exports = { resolve };
