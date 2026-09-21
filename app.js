const C = window.NAEVIS_CONFIG || {};
const genres = ['Pop','Rock','Indie','Hip-Hop','R&B','Electrónica','Jazz','K-Pop','Reggaetón','Clásica','Metal','Lo-Fi','Alternative'];
const demoArtists = ['Frank Ocean','Lana Del Rey','Tame Impala','SZA','The Weeknd','BLACKPINK'];
const DEMO_TRACK_URI = 'spotify:track:4iV5W9uYEdYUVa79Axb7Rh';

let spotifyPlayer = null;
let spotifyDeviceId = null;
let currentTrack = null;
let currentDuration = 0;
let currentPosition = 0;
let playbackTimer = null;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function toast(message) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = message;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function route() {
  let id = location.hash.slice(1) || 'home';
  if (id === 'create-account') id = 'create';
  if (!$('#' + id)) id = 'home';

  $$('.page').forEach(p => p.style.display = 'none');
  $('#' + id).style.display = 'block';
  $$('.side nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + id));

  const titles = {
    home: 'Welcome to NAEVIS.exe', create: 'Create Account.exe', music: 'Music Taste.exe',
    spotify: 'Connect Spotify.exe', verify: 'Verify Profile.exe', discover: 'Discover.exe',
    match: "It's a Match!.exe", friends: 'My Friends.exe', now: 'Now Playing.exe', profile: 'My Profile.exe'
  };
  $('#title').textContent = titles[id] || 'NAEVIS.exe';

  if (id === 'now') syncPlaybackState();
}

function renderGenres() {
  const g = $('#genres');
  g.innerHTML = genres.map(x => `<button class="retro ${['Pop','Indie','R&B'].includes(x) ? 'blue' : ''}" type="button">${x}</button>`).join('');
}

function renderArtists(list = demoArtists) {
  $('#artists').innerHTML = list.map(x => `<div class="artist" data-name="${x}"><div class="artist-art">🎵</div><b>${x}</b></div>`).join('');
  $$('.artist').forEach(a => a.onclick = () => toast(`${a.dataset.name} added to your sound!`));
}

function renderFriends() {
  const data = [
    ['Sofi','92%','Espresso — Sabrina Carpenter'],
    ['Miguel','85%','Sweat — The Neighbourhood'],
    ['Sofia','78%','Last seen 2h ago'],
    ['Carlos','76%','After Hours — The Weeknd']
  ];
  $('#friendsList').innerHTML = data.map(x => `<div class="friend"><div class="avatar">${x[0][0]}</div><div class="meta"><b>${x[0]}</b><small>${x[1]} compatibility • ${x[2]}</small></div><a class="retro" href="#now">View</a></div>`).join('');
}

function randomString(n = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(n));
  return [...values].map(x => chars[x % chars.length]).join('');
}

async function challenge(value) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function getAccessToken() {
  return localStorage.getItem('naevis_token');
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('naevis_refresh_token');
  if (!refreshToken || !C.spotifyClientId) return null;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: C.spotifyClientId
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {'Content-Type':'application/x-www-form-urlencoded'},
    body
  });
  const data = await response.json();
  if (!response.ok) {
    localStorage.removeItem('naevis_token');
    localStorage.removeItem('naevis_refresh_token');
    return null;
  }

  localStorage.setItem('naevis_token', data.access_token);
  localStorage.setItem('naevis_expiry', String(Date.now() + data.expires_in * 1000));
  if (data.refresh_token) localStorage.setItem('naevis_refresh_token', data.refresh_token);
  return data.access_token;
}

async function validToken() {
  let token = getAccessToken();
  const expiry = Number(localStorage.getItem('naevis_expiry') || 0);
  if (token && Date.now() < expiry - 60000) return token;
  if (localStorage.getItem('naevis_refresh_token')) return refreshAccessToken();
  return token;
}

async function spotifyLogin() {
  if (!C.spotifyClientId) return toast('Add your Spotify Client ID in config.js first.');

  const verifier = randomString();
  const state = randomString(24);
  localStorage.setItem('naevis_verifier', verifier);
  localStorage.setItem('naevis_state', state);

  const scope = [
    'user-read-private',
    'user-read-email',
    'streaming',
    'user-read-currently-playing',
    'user-read-playback-state',
    'user-modify-playback-state'
  ].join(' ');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: C.spotifyClientId,
    scope,
    code_challenge_method: 'S256',
    code_challenge: await challenge(verifier),
    redirect_uri: C.spotifyRedirectUri,
    state
  });

  location.href = 'https://accounts.spotify.com/authorize?' + params.toString();
}

async function callback() {
  const q = new URLSearchParams(location.search);
  const code = q.get('code');
  const returnedState = q.get('state');
  const error = q.get('error');
  if (error) return toast('Spotify authorization was cancelled.');
  if (!code) return;
  if (!C.spotifyClientId) return;

  const savedState = localStorage.getItem('naevis_state');
  if (savedState && returnedState !== savedState) return toast('Spotify security check failed.');

  const verifier = localStorage.getItem('naevis_verifier');
  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: C.spotifyRedirectUri,
      client_id: C.spotifyClientId,
      code_verifier: verifier
    });

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error_description || 'Token error');

    localStorage.setItem('naevis_token', data.access_token);
    localStorage.setItem('naevis_expiry', String(Date.now() + data.expires_in * 1000));
    if (data.refresh_token) localStorage.setItem('naevis_refresh_token', data.refresh_token);
    localStorage.removeItem('naevis_verifier');
    localStorage.removeItem('naevis_state');

    history.replaceState({}, '', location.pathname + '#now');
    toast('Spotify connected! 🎵');
    await initSpotifyPlayer();
  } catch (e) {
    toast('Spotify connection failed. Check Client ID and Redirect URI.');
  }
}

async function spotifyFetch(url, options = {}) {
  let token = await validToken();
  if (!token) throw new Error('NO_TOKEN');

  let response = await fetch(url, {
    ...options,
    headers: {...(options.headers || {}), Authorization:`Bearer ${token}`}
  });

  if (response.status === 401 && localStorage.getItem('naevis_refresh_token')) {
    token = await refreshAccessToken();
    if (!token) throw new Error('AUTH_EXPIRED');
    response = await fetch(url, {
      ...options,
      headers: {...(options.headers || {}), Authorization:`Bearer ${token}`}
    });
  }
  return response;
}

async function searchSpotify() {
  const q = $('#search').value.trim();
  if (!q) return toast('Write an artist name first.');
  try {
    const response = await spotifyFetch('https://api.spotify.com/v1/search?' + new URLSearchParams({q,type:'artist',limit:8,market:'MX'}));
    if (!response.ok) return toast('Spotify search failed.');
    const data = await response.json();
    const list = (data.artists?.items || []).map(a => a.name);
    renderArtists(list.length ? list : demoArtists);
  } catch (e) {
    toast('Connect Spotify first.');
  }
}

async function searchTracks() {
  const q = $('#trackSearch').value.trim();
  if (!q) return toast('Write a song or artist first.');
  try {
    const response = await spotifyFetch('https://api.spotify.com/v1/search?' + new URLSearchParams({q,type:'track',limit:8,market:'MX'}));
    if (!response.ok) return toast('Could not search Spotify tracks.');
    const data = await response.json();
    const tracks = data.tracks?.items || [];
    const box = $('#trackResults');
    box.innerHTML = tracks.map(track => `
      <button class="track-result" data-uri="${track.uri}" data-name="${escapeHtml(track.name)}" data-artist="${escapeHtml(track.artists.map(a=>a.name).join(', '))}">
        <img src="${track.album?.images?.[2]?.url || track.album?.images?.[0]?.url || ''}" alt="">
        <span><b>${escapeHtml(track.name)}</b><small>${escapeHtml(track.artists.map(a=>a.name).join(', '))}</small></span>
        <strong>▶</strong>
      </button>`).join('') || '<small>No tracks found.</small>';
    $$('.track-result').forEach(button => button.onclick = () => playTrack(button.dataset.uri));
  } catch (e) {
    toast('Connect Spotify first.');
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

async function initSpotifyPlayer() {
  if (!window.Spotify) return toast('Spotify Player SDK is still loading. Try again in a moment.');
  const token = await validToken();
  if (!token) return toast('Connect Spotify first.');
  if (spotifyPlayer) return spotifyPlayer.connect();

  spotifyPlayer = new Spotify.Player({
    name: 'NAEVIS Web Player',
    getOAuthToken: async cb => {
      const freshToken = await validToken();
      cb(freshToken);
    },
    volume: 0.65
  });

  spotifyPlayer.addListener('ready', async ({device_id}) => {
    spotifyDeviceId = device_id;
    localStorage.setItem('naevis_device_id', device_id);
    toast('NAEVIS player ready 🎧');
    await transferToNAEVIS();
  });

  spotifyPlayer.addListener('not_ready', ({device_id}) => {
    if (spotifyDeviceId === device_id) spotifyDeviceId = null;
  });

  spotifyPlayer.addListener('player_state_changed', state => {
    if (!state) return;
    currentTrack = state.track_window.current_track;
    currentDuration = state.duration;
    currentPosition = state.position;
    updateNowPlayingUI(state);
  });

  spotifyPlayer.addListener('initialization_error', ({message}) => toast('Spotify player error: ' + message));
  spotifyPlayer.addListener('authentication_error', ({message}) => toast('Spotify authentication error. Reconnect your account.'));
  spotifyPlayer.addListener('account_error', () => toast('Web Playback needs a Spotify Premium account.'));
  spotifyPlayer.addListener('playback_error', ({message}) => toast('Playback error: ' + message));
  spotifyPlayer.addListener('autoplay_failed', () => toast('Press Play to start audio.'));

  const connected = await spotifyPlayer.connect();
  if (!connected) toast('Could not connect the NAEVIS player.');
}

async function transferToNAEVIS() {
  if (!spotifyDeviceId) return;
  try {
    const response = await spotifyFetch('https://api.spotify.com/v1/me/player', {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({device_ids:[spotifyDeviceId], play:false})
    });
    if (!response.ok && response.status !== 204) toast('Could not activate NAEVIS as a Spotify device.');
  } catch (e) {}
}

async function playTrack(uri = DEMO_TRACK_URI) {
  if (!spotifyPlayer || !spotifyDeviceId) {
    await initSpotifyPlayer();
    if (!spotifyDeviceId) return toast('Connect Spotify and wait for the NAEVIS player to be ready.');
  }
  try {
    const response = await spotifyFetch('https://api.spotify.com/v1/me/player/play?device_id=' + encodeURIComponent(spotifyDeviceId), {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({uris:[uri]})
    });
    if (!response.ok && response.status !== 204) {
      const errorData = await response.json().catch(()=>({}));
      throw new Error(errorData.error?.message || 'Playback failed');
    }
    toast('Playing on NAEVIS 🎵');
  } catch (e) {
    toast(e.message.includes('Premium') ? 'Spotify Premium is required.' : 'Could not start playback. Check your Spotify account.');
  }
}

async function syncPlaybackState() {
  try {
    const response = await spotifyFetch('https://api.spotify.com/v1/me/player');
    if (response.status === 204) return;
    if (!response.ok) return;
    const state = await response.json();
    updateNowPlayingUI(state);
  } catch (e) {}
}

function updateNowPlayingUI(state) {
  if (!state?.item) return;
  currentTrack = state.item;
  currentDuration = state.item.duration_ms || state.duration || 0;
  currentPosition = state.progress_ms || state.position || 0;

  $('#nowTitle').textContent = state.item.name || 'Now Playing';
  $('#nowArtist').textContent = state.item.artists?.map(a => a.name).join(', ') || '';
  $('#albumImage').src = state.item.album?.images?.[0]?.url || '';
  $('#albumImage').alt = state.item.album?.name || 'Spotify album';
  $('#play').textContent = state.is_playing ? 'Ⅱ' : '▶';
  $('#progress').max = currentDuration || 1;
  $('#progress').value = currentPosition;
  $('#currentTime').textContent = formatMs(currentPosition);
  $('#duration').textContent = formatMs(currentDuration);

  clearInterval(playbackTimer);
  if (state.is_playing) {
    playbackTimer = setInterval(() => {
      currentPosition += 1000;
      if (currentPosition <= currentDuration) {
        $('#progress').value = currentPosition;
        $('#currentTime').textContent = formatMs(currentPosition);
      }
    }, 1000);
  }
}

function formatMs(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`;
}

async function togglePlay() {
  if (!spotifyPlayer) await initSpotifyPlayer();
  if (!spotifyPlayer || !spotifyDeviceId) return toast('Connect Spotify first.');
  try {
    await spotifyPlayer.togglePlay();
  } catch (e) { toast('Could not change playback.'); }
}

async function nextTrack() {
  if (!spotifyPlayer) return toast('Connect Spotify first.');
  try { await spotifyPlayer.nextTrack(); } catch (e) { toast('Could not skip to next track.'); }
}

async function previousTrack() {
  if (!spotifyPlayer) return toast('Connect Spotify first.');
  try { await spotifyPlayer.previousTrack(); } catch (e) { toast('Could not go to previous track.'); }
}

async function seekTrack() {
  if (!spotifyPlayer) return;
  try { await spotifyPlayer.seek(Number($('#progress').value)); } catch (e) {}
}

async function setVolume() {
  if (!spotifyPlayer) return;
  try { await spotifyPlayer.setVolume(Number($('#volume').value) / 100); } catch (e) {}
}

document.addEventListener('DOMContentLoaded', async () => {
  renderGenres();
  renderArtists();
  renderFriends();
  route();
  await callback();

  $('#clock').textContent = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  setInterval(() => $('#clock').textContent = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}), 30000);

  addEventListener('hashchange', route);

  $('#accountForm').onsubmit = e => {
    e.preventDefault();
    const name = $('#name').value.trim() || 'Regina';
    const age = $('#age').value || 21;
    $('#sideName').textContent = name;
    $('#profileName').textContent = `${name}, ${age}`;
    $('#profileAvatar').textContent = name[0].toUpperCase();
    localStorage.setItem('naevis_profile', JSON.stringify({name, age}));
    toast('Account created!');
    location.hash = '#music';
  };

  let savedProfile = JSON.parse(localStorage.getItem('naevis_profile') || 'null');
  if (savedProfile?.name?.toLowerCase() === 'valeria') {
    savedProfile = {name:'Regina', age:21};
    localStorage.setItem('naevis_profile', JSON.stringify(savedProfile));
  }
  if (savedProfile) {
    $('#sideName').textContent = savedProfile.name;
    $('#profileName').textContent = `${savedProfile.name}, ${savedProfile.age}`;
    $('#profileAvatar').textContent = savedProfile.name[0].toUpperCase();
  }

  $('#saveMusic').onclick = () => { toast('Your sound was saved!'); location.hash = '#spotify'; };
  $('#spotifyBtn').onclick = async () => { await spotifyLogin(); };
  $('#skipSpotify').onclick = () => { location.hash = '#verify'; };
  $('#verifyBtn').onclick = () => { toast('Demo verification complete ✓'); location.hash = '#discover'; };
  $('#like').onclick = () => { toast("It's a match! ♡"); location.hash = '#match'; };
  $('#pass').onclick = () => toast('Finding another frequency...');
  $('#searchBtn').onclick = searchSpotify;
  $('#search').onkeydown = e => { if (e.key === 'Enter') searchSpotify(); };
  $('#trackSearchBtn').onclick = searchTracks;
  $('#trackSearch').onkeydown = e => { if (e.key === 'Enter') searchTracks(); };
  $('#play').onclick = togglePlay;
  $('#next').onclick = nextTrack;
  $('#prev').onclick = previousTrack;
  $('#progress').oninput = seekTrack;
  $('#volume').oninput = setVolume;
  $('#privacy').onchange = e => toast('Now Playing: ' + e.target.value);
  $$('.reactions button').forEach(b => b.onclick = () => toast('Reaction sent ' + b.textContent));

  const token = await validToken();
  if (token && window.Spotify) initSpotifyPlayer();
});
