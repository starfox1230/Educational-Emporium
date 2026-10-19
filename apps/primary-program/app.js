const tracks = [
  { title: 'Choose to Serve the Lord', src: 'audio/01-choose-to-serve-the-lord.m4a' },
  { title: "I'll Walk with You", src: 'audio/02-ill-walk-with-you.m4a' },
  { title: 'Holy Places', src: 'audio/03-holy-places.m4a' },
  { title: "I'm Trying to Be Like Jesus", src: 'audio/04-im-trying-to-be-like-jesus.m4a' },
  { title: "I Feel My Savior's Love", src: 'audio/05-i-feel-my-saviors-love.m4a' },
  { title: 'My Heavenly Father Loves Me', src: 'audio/06-my-heavenly-father-loves-me.m4a' },
  { title: 'Kindness Begins with Me', src: 'audio/07-kindness-begins-with-me.m4a' },
  { title: "I Will Walk with Jesus", src: 'audio/08-i-will-walk-with-jesus.m4a' },
].map((track) => ({ ...track, url: track.src, checked: true }));

const audio = document.querySelector('#audio');
const songsEl = document.querySelector('#songs');
const statusEl = document.querySelector('#status');
const playButton = document.querySelector('#play');
const playGlyph = document.querySelector('#playGlyph');
const seek = document.querySelector('#seek');
let currentIndex = -1;

function renderList() {
  songsEl.replaceChildren();
  tracks.forEach((track, index) => {
    const row = document.createElement('li');
    row.className = 'song';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'song-check';
    checkbox.checked = track.checked;
    checkbox.setAttribute('aria-label', `Play ${track.title}`);
    checkbox.addEventListener('change', () => {
      track.checked = checkbox.checked;
      updateCount();
      if (!track.checked && index === currentIndex && !audio.paused) {
        const next = nextPlayable(currentIndex);
        if (next < 0) {
          audio.pause();
          currentIndex = -1;
          document.querySelector('#currentTitle').textContent = 'Ready when you are';
          renderList();
        } else void playTrack(next);
      }
    });
    const title = document.createElement('span');
    title.className = 'song-title';
    title.textContent = track.title;
    const mark = document.createElement('span');
    mark.className = 'song-indicator';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = index === currentIndex && !audio.paused ? '♪' : '';
    row.append(checkbox, title, mark);
    row.addEventListener('click', (event) => {
      if (event.target === checkbox || !track.checked) return;
      void playTrack(index);
    });
    songsEl.append(row);
  });
}

function updateCount() {
  const selected = tracks.filter((track) => track.checked).length;
  document.querySelector('#selectAll').textContent = selected === tracks.length ? 'Deselect all' : 'Select all';
  document.querySelector('#loopCount').textContent = `${selected} song${selected === 1 ? '' : 's'} · loops`;
  renderList();
}

function nextPlayable(from, direction = 1) {
  for (let step = 1; step <= tracks.length; step += 1) {
    const index = (from + direction * step + tracks.length * 2) % tracks.length;
    if (tracks[index].checked && tracks[index].url) return index;
  }
  if (from >= 0 && tracks[from].checked && tracks[from].url) return from;
  return -1;
}

function updateMediaSession() {
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined' || currentIndex < 0) return;
  const track = tracks[currentIndex];
  navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: 'Primary Songs', album: 'Primary Program Practice' });
  navigator.mediaSession.setActionHandler('play', () => { void audio.play(); });
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('previoustrack', () => void playTrack(nextPlayable(currentIndex, -1)));
  navigator.mediaSession.setActionHandler('nexttrack', () => void playTrack(nextPlayable(currentIndex)));
}

async function playTrack(index) {
  if (index < 0) return;
  currentIndex = index;
  const track = tracks[index];
  audio.src = track.url;
  document.querySelector('#currentTitle').textContent = track.title;
  playButton.disabled = false;
  renderList();
  updateMediaSession();
  audio.play().then(() => {
    statusEl.textContent = 'Now playing';
  }).catch(() => {
    statusEl.textContent = 'Add song files to audio/';
  });
}

document.querySelector('#selectAll').addEventListener('click', () => {
  const allChecked = tracks.every((track) => track.checked);
  tracks.forEach((track) => { track.checked = !allChecked; });
  if (allChecked && !audio.paused) {
    audio.pause();
    currentIndex = -1;
    document.querySelector('#currentTitle').textContent = 'Ready when you are';
  }
  updateCount();
});

playButton.addEventListener('click', () => {
  if (audio.paused) {
    if (currentIndex < 0 || !tracks[currentIndex]?.checked) {
      const first = tracks.findIndex((track) => track.checked && track.url);
      void playTrack(first);
    } else void audio.play();
  } else audio.pause();
});
document.querySelector('#previous').addEventListener('click', () => void playTrack(nextPlayable(currentIndex, -1)));
document.querySelector('#next').addEventListener('click', () => void playTrack(nextPlayable(currentIndex)));
audio.addEventListener('ended', () => void playTrack(nextPlayable(currentIndex)));
audio.addEventListener('play', () => { playGlyph.textContent = 'Ⅱ'; playButton.setAttribute('aria-label', 'Pause'); document.querySelector('.transport').classList.add('is-playing'); renderList(); });
audio.addEventListener('pause', () => { playGlyph.textContent = '▶'; playButton.setAttribute('aria-label', 'Play'); document.querySelector('.transport').classList.remove('is-playing'); renderList(); });
audio.addEventListener('timeupdate', () => {
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  seek.value = duration ? String(Math.round((audio.currentTime / duration) * 1000)) : '0';
  seek.style.setProperty('--progress', `${seek.value / 10}%`);
  document.querySelector('#elapsed').textContent = formatTime(audio.currentTime);
  document.querySelector('#duration').textContent = formatTime(duration);
  if ('mediaSession' in navigator && typeof navigator.mediaSession.setPositionState === 'function' && duration) {
    navigator.mediaSession.setPositionState({ duration, playbackRate: audio.playbackRate, position: audio.currentTime });
  }
});
seek.addEventListener('input', () => { if (Number.isFinite(audio.duration)) audio.currentTime = (Number(seek.value) / 1000) * audio.duration; });

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

updateCount();


