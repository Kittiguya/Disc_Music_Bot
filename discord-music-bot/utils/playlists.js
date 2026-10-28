const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function getFilePath(guildId) {
  return path.join(DATA_DIR, `playlists_${guildId}.json`);
}

function load(guildId) {
  const fp = getFilePath(guildId);
  if (!fs.existsSync(fp)) return {};
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return {};
  }
}

function save(guildId, data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(getFilePath(guildId), JSON.stringify(data, null, 2));
}


function listPlaylists(guildId) {
  return Object.keys(load(guildId));
}


function getPlaylist(guildId, name) {
  const data = load(guildId);
  return data[name.toLowerCase()] || null;
}


function savePlaylist(guildId, name, tracks) {
  const data = load(guildId);
  data[name.toLowerCase()] = { name, tracks, createdAt: Date.now() };
  save(guildId, data);
}

function addToPlaylist(guildId, name, tracks) {
  const data = load(guildId);
  const key = name.toLowerCase();
  if (!data[key]) {
    data[key] = { name, tracks: [], createdAt: Date.now() };
  }
  data[key].tracks.push(...tracks);
  save(guildId, data);
  return data[key].tracks.length;
}

function deletePlaylist(guildId, name) {
  const data = load(guildId);
  const key = name.toLowerCase();
  if (!data[key]) return false;
  delete data[key];
  save(guildId, data);
  return true;
}

module.exports = { listPlaylists, getPlaylist, savePlaylist, addToPlaylist, deletePlaylist };
