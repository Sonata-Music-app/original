// ============================================
// SONATA 2.0 - Music App with IndexedDB
// ============================================

// IndexedDB Configuration
const DB_NAME = "SONATA_DB"
const DB_VERSION = 1
const SONGS_STORE = "songs"
const PLAYLISTS_STORE = "playlists"

let db = null
let songs = []
let playlists = []
let currentSongIndex = 0 // Used as fallback or for UI tracking, but playbackQueue is source of truth
let isPlaying = false
let selectedPlaylistId = null
let currentGenre = ""
let currentMood = ""
let currentTime = ""
let pendingUploadFiles = []
let songToEditId = null
let favorites = []
let searchTerm = ""
let showOnlyFavorites = false
let isShuffle = false
let playbackQueue = []
let originalQueue = []
let currentQueueIndex = 0
let hasCountedCurrentPlay = false; // NEW: Smart Stats tracker

// Crossfade & Audio Graph Globals
let activeDeck = 1; // 1 or 2
let isCrossfading = false;
let crossfadeDuration = 6; // Seconds
let flowStateEnabled = true; // NEW: Toggle state
let sourceNode1 = null;
let sourceNode2 = null;
let audioGraphSetup = false;

// Audio Nodes
let audioCtx = null;
let bassNode = null;
let midNode = null;
let trebleNode = null;
let compressorNode = null;
let isEnhancerActive = false;

const SONIC_PROFILES = {
  "rock": { name: "Rock", bass: 3, mid: 0, treble: 2, desc: "Satter Bass & klare Höhen" },
  "pop": { name: "Pop", bass: 2, mid: -1, treble: 1, desc: "Moderne V-Kurve für Radio-Sound" },
  "electronic": { name: "Electronic", bass: 4, mid: 0, treble: 3, desc: "Maximaler Druck & Brillanz" },
  "hiphop": { name: "Hip-Hop", bass: 5, mid: -1, treble: 1, desc: "Deep Bass Boost" },
  "classical": { name: "Klassik", bass: 1, mid: 2, treble: 2, desc: "Natürliche Wärme & Präsenz" },
  "jazz": { name: "Jazz", bass: 2, mid: 1, treble: 1, desc: "Warmer, entspannter Charakter" },
  "metal": { name: "Metal", bass: 2, mid: 2, treble: 4, desc: "Aggressive Mitten & Schärfe" },
  "default": { name: "Balanced", bass: 2, mid: 0, treble: 2, desc: "Optimierte Klarheit & Dynamik" }
};

// New: Toast Notification Helper
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container")
  const toast = document.createElement("div")
  toast.className = `toast ${type}`
  toast.innerHTML = `
        <span class="toast-icon">${type === "success" ? "✓" : "!"}</span>
        <span class="toast-message">${message}</span>
    `
  container.appendChild(toast)

  // Remove after 3 seconds
  setTimeout(() => {
    toast.style.animation = "fadeOut 0.3s ease forwards"
    setTimeout(() => toast.remove(), 300)
  }, 3000)
}

const genres = [
  { id: "classical", name: "Klassik", emoji: "🎻" },
  { id: "jazz", name: "Jazz", emoji: "🎷" },
  { id: "rock", name: "Rock", emoji: "🎸" },
  { id: "pop", name: "Pop", emoji: "🎤" },
  { id: "electronic", name: "Electronic", emoji: "🎛️" },
  { id: "hiphop", name: "Hip-Hop", emoji: "🎧" },
  { id: "blues", name: "Blues", emoji: "🎹" },
  { id: "metal", name: "Metal", emoji: "🤘" },
  { id: "reggae", name: "Reggae", emoji: "🌴" },
  { id: "country", name: "Country", emoji: "🤠" },
]

const moods = ["Energisch", "Entspannt", "Fokussiert", "Party", "Melancholisch", "Euphorisch"]
const times = ["Morgens", "Mittags", "Abends", "Nachts"]

// ============================================
// IndexedDB Initialization
// ============================================
async function initDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)

    request.onupgradeneeded = (event) => {
      const db = event.target.result

      if (!db.objectStoreNames.contains(SONGS_STORE)) {
        db.createObjectStore(SONGS_STORE, { keyPath: "id" })
      }

      if (!db.objectStoreNames.contains(PLAYLISTS_STORE)) {
        db.createObjectStore(PLAYLISTS_STORE, { keyPath: "id" })
      }
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }
  })
}

// ============================================
// Database Operations
// ============================================
async function getSongsFromDB() {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Datenbank nicht initialisiert"));
    const transaction = db.transaction([SONGS_STORE], "readonly")
    const store = transaction.objectStore(SONGS_STORE)
    const request = store.getAll()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

async function getPlaylistsFromDB() {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Datenbank nicht initialisiert"));
    const transaction = db.transaction([PLAYLISTS_STORE], "readonly")
    const store = transaction.objectStore(PLAYLISTS_STORE)
    const request = store.getAll()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

async function saveSongToDB(song) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Datenbank nicht initialisiert"));
    const transaction = db.transaction([SONGS_STORE], "readwrite")
    const store = transaction.objectStore(SONGS_STORE)
    const request = store.put(song)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

async function deleteSongFromDB(songId) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Datenbank nicht initialisiert"));
    const transaction = db.transaction([SONGS_STORE], "readwrite")
    const store = transaction.objectStore(SONGS_STORE)
    const request = store.delete(songId)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

async function savePlaylistToDB(playlist) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Datenbank nicht initialisiert"));
    const transaction = db.transaction([PLAYLISTS_STORE], "readwrite")
    const store = transaction.objectStore(PLAYLISTS_STORE)
    const request = store.put(playlist)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

async function deletePlaylistFromDB(playlistId) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Datenbank nicht initialisiert"));
    const transaction = db.transaction([PLAYLISTS_STORE], "readwrite")
    const store = transaction.objectStore(PLAYLISTS_STORE)
    const request = store.delete(playlistId)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

async function clearAllDB() {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Datenbank nicht initialisiert"));
    const transaction = db.transaction([SONGS_STORE, PLAYLISTS_STORE], "readwrite")

    const songsRequest = transaction.objectStore(SONGS_STORE).clear()
    const playlistsRequest = transaction.objectStore(PLAYLISTS_STORE).clear()

    songsRequest.onerror = () => reject(songsRequest.error)
    playlistsRequest.onerror = () => reject(playlistsRequest.error)

    transaction.oncomplete = () => resolve()
  })
}

// ============================================
// Initialize App
// ============================================
async function init() {
  try {
    console.log("Initializing SONATA App...");
    await initDatabase();
    console.log("Database initialized successfully.");
    await loadData();
    await migrateSongsForStatistics(); // Migrate old songs

    // UI Setup
    setupFileInput();

    // Initialize Audio Engine Immediately for Decks
    const audio1 = document.getElementById("audio-player");
    const audio2 = document.getElementById("audio-player-2");
    setupAudioEngine(audio1, audio2);
    setupAudioListener(audio1);
    setupAudioListener(audio2);

    // NEW: Load Flow State Setting
    const flowSetting = localStorage.getItem("flowStateEnabled");
    if (flowSetting !== null) {
      flowStateEnabled = flowSetting === "true";
    }
    // Sync Checkbox
    const flowToggle = document.getElementById("flow-state-toggle");
    if (flowToggle) {
      flowToggle.checked = flowStateEnabled;
    }

    setupVolumeControl();
    renderSongs();
    renderPlaylists();
    setupGenreButtons();
    setupMoodButtons();
    setupTimeButtons();
    updateStorageInfo();
    setupSearch();
    setupKeyboardShortcuts();

    // NEW: Ensure Favorites Playlist exists
    await ensureFavoritesPlaylist();

    // Remove any previous error toasts if everything worked
    const errorToast = document.querySelector(".toast.error.db-error");
    if (errorToast) errorToast.remove();

  } catch (error) {
    console.error("CRITICAL: Fehler beim Initialisieren der App:", error);
    showToast("FATAL: Datenbank konnte nicht geladen werden.", "error");

    // Show Emergency Reset Button
    showDatabaseErrorUI(error);
  }
}

function showDatabaseErrorUI(error) {
  // Create a visible error banner
  const banner = document.createElement("div");
  banner.style.cssText = `
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.9);
        z-index: 9999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #ff4444;
        font-family: monospace;
        text-align: center;
        padding: 20px;
    `;

  banner.innerHTML = `
        <h1>⚠️ SYSTEM FEHLER</h1>
        <p>Die Datenbank ist beschädigt oder konnte nicht geladen werden.</p>
        <p style="color: #888; margin-bottom: 20px;">Error: ${error.message}</p>
        <button onclick="emergencyReset()" style="
            background: #ff4444; color: white; border: none;
            padding: 15px 30px; font-size: 16px; border-radius: 8px;
            cursor: pointer; font-weight: bold;
        ">DATENBANK ZURÜCKSETZEN (RESET)</button>
        <p style="margin-top: 10px; font-size: 12px; color: #666;">Warnung: Alle Songs und Playlists gehen verloren.</p>
    `;

  document.body.appendChild(banner);
}

async function emergencyReset() {
  if (!confirm("Bist du SICHER? Alle Daten werden gelöscht um die App zu reparieren.")) return;

  try {
    if (db) db.close();
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => {
      alert("Datenbank gelöscht. Seite wird neu geladen.");
      window.location.reload();
    };
    req.onerror = (e) => {
      alert("Reset fehlgeschlagen: " + e.target.error);
    };
    req.onblocked = () => {
      alert("Reset blockiert. Bitte schließe alle anderen Tabs dieser App und versuche es erneut.");
    };
  } catch (e) {
    alert("Fehler beim Reset: " + e);
  }
}

// Ensure init runs after DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// ============================================
// Data Loading
// ============================================
async function loadData() {
  try {
    songs = await getSongsFromDB()
    playlists = await getPlaylistsFromDB()
  } catch (error) {
    console.error("Fehler beim Laden von Daten:", error)
  }
}

// ============================================
// File Upload Handling
// ============================================
function setupFileInput() {
  const fileInput = document.getElementById("file-input")
  fileInput.addEventListener("change", handleFileSelect)

  // Drag and drop
  const uploadZone = document.querySelector(".upload-zone")
  uploadZone.addEventListener("dragover", (e) => {
    e.preventDefault()
    uploadZone.style.background = "rgba(212, 175, 55, 0.12)"
  })

  uploadZone.addEventListener("dragleave", () => {
    uploadZone.style.background = "rgba(212, 175, 55, 0.06)"
  })

  uploadZone.addEventListener("drop", (e) => {
    e.preventDefault()
    uploadZone.style.background = "rgba(212, 175, 55, 0.06)"
    const files = Array.from(e.dataTransfer.files)
    processFiles(files)
  })
}

function handleFileSelect(e) {
  const files = Array.from(e.target.files)
  processFiles(files)
  e.target.value = ""
}

function processFiles(files) {
  const audioFiles = files.filter((f) => f.type.startsWith("audio/"))
  if (audioFiles.length === 0) {
    showToast("Bitte nur Audiodateien auswählen", "error")
    return
  }

  // Store all files and open modal once
  pendingUploadFiles = audioFiles
  openUploadModal()
}

// Render playlist selector with multi-select support
function renderPlaylistSelector(containerId) {
  const container = document.getElementById(containerId)

  if (playlists.length === 0) {
    container.innerHTML = '<div class="empty-message">Keine Playlists vorhanden</div>'
    return
  }

  const sortedPlaylists = [...playlists].sort((a, b) => a.name.localeCompare(b.name))

  container.innerHTML = sortedPlaylists
    .map(p => {
      const genre = genres.find(g => g.id === p.genre)
      return `
        <div class="playlist-option" data-playlist-id="${p.id}" onclick="togglePlaylistSelection(this)">
          ${p.name} (${genre?.emoji || "🎵"} ${genre?.name || "Unbekannt"})
        </div>
      `
    })
    .join("")
}

// Toggle playlist selection for multi-select
function togglePlaylistSelection(el) {
  el.classList.toggle("selected")
}

function openUploadModal() {
  if (pendingUploadFiles.length === 0) return

  const nameInput = document.getElementById("song-name-input")

  if (pendingUploadFiles.length > 1) {
    nameInput.value = `${pendingUploadFiles.length} Dateien ausgewählt`
    nameInput.disabled = true
    nameInput.placeholder = "Namen werden von Dateien übernommen"
  } else {
    nameInput.value = pendingUploadFiles[0].name.replace(/\.[^/.]+$/, "")
    nameInput.disabled = false
    nameInput.placeholder = "Song Name eingeben"
  }

  renderPlaylistSelector("upload-playlist-selector")
  document.getElementById("upload-modal").classList.add("active")
}

// Helper to read file as ArrayBuffer
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

async function confirmUpload() {
  if (pendingUploadFiles.length === 0) return

  const nameInput = document.getElementById("song-name-input")
  const singleName = nameInput.value.trim()

  // Validation only for single file if user cleared the input
  if (pendingUploadFiles.length === 1 && !singleName) {
    showToast("Bitte einen Song-Namen eingeben", "error")
    return
  }

  try {
    // Collect all selected playlists (multi-select support)
    const selectedPlaylists = document.querySelectorAll("#upload-playlist-selector .playlist-option.selected")
    const selectedPlaylistIds = Array.from(selectedPlaylists).map(el => el.dataset.playlistId)

    let successCount = 0

    // Process all files
    for (const file of pendingUploadFiles) {
      try {
        const buffer = await readFileAsArrayBuffer(file)

        // Use manual name for single file, or filename for multiple
        const songName = (pendingUploadFiles.length === 1) ? singleName : file.name.replace(/\.[^/.]+$/, "")

        const song = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5), // Ensure unique ID
          name: songName,
          data: buffer,
          type: file.type,
          playlistId: null,
          dateAdded: new Date().toISOString(),
          size: file.size,
        }

        // TRANSACTIONAL: First save song to DB
        await saveSongToDB(song)
        songs.push(song)

        // TRANSACTIONAL: Add to playlists
        if (selectedPlaylistIds.length > 0) {
          for (const playlistId of selectedPlaylistIds) {
            const playlist = playlists.find(p => p.id === playlistId)
            if (playlist) {
              // DUPLICATE PREVENTION
              if (!playlist.songs.includes(song.id)) {
                playlist.songs.push(song.id)
                await savePlaylistToDB(playlist)
              }
            }
          }
        }
        successCount++
      } catch (err) {
        console.error(`Fehler bei Datei ${file.name}:`, err)
      }
    }

    renderSongs()
    renderPlaylists()
    closeModal("upload-modal")
    pendingUploadFiles = []
    nameInput.value = ""
    nameInput.disabled = false // Reset disabled state
    updateStorageInfo()

    if (successCount > 0) {
      const playlistMsg = selectedPlaylistIds.length > 0 ? ` in ${selectedPlaylistIds.length} Playlists` : ""
      showToast(`${successCount} Song(s) erfolgreich hochgeladen${playlistMsg}`)
    } else {
      showToast("Fehler beim Upload", "error")
    }

  } catch (error) {
    console.error("Fehler beim Upload-Prozess:", error)
    showToast("Fehler beim Upload der Dateien", "error")
  }
}

// ============================================
// Statistics Migration & Tracking
// ============================================
async function migrateSongsForStatistics() {
  let updated = false

  for (const song of songs) {
    if (song.playCount === undefined) {
      song.playCount = 0
      song.lastPlayed = null
      await saveSongToDB(song)
      updated = true
    }
  }

  if (updated) {
    console.log("Songs migrated with statistics fields")
  }
}

async function updateSongStatistics(songId) {
  const song = songs.find(s => s.id === songId)
  if (song) {
    song.playCount = (song.playCount || 0) + 1
    song.lastPlayed = new Date().toISOString()

    try {
      await saveSongToDB(song)
      updateStatisticsDisplay()
    } catch (error) {
      console.error("Fehler beim Aktualisieren der Statistiken:", error)
    }
  }
}

function updateStatisticsDisplay() {
  const statsSection = document.getElementById("statistics-section")
  if (!statsSection || !statsSection.classList.contains("active")) return

  renderMostPlayedSongs()
  renderRecentlyPlayed()
  renderListeningTrends()
}

// ============================================
function openCreatePlaylistModal() {
  currentGenre = ""
  currentMood = ""
  currentTime = ""
  document.getElementById("playlist-name-input").value = ""
  renderGenreButtons()
  renderMoodButtons()
  renderTimeButtons()
  document.getElementById("create-playlist-modal").classList.add("active")
}

function setupGenreButtons() {
  renderGenreButtons()
}

function renderGenreButtons() {
  const container = document.getElementById("genre-buttons")
  container.innerHTML = genres
    .map(
      (g) => `
        <button class="genre-btn" data-genre="${g.id}" onclick="selectGenre('${g.id}', this)">
            ${g.emoji} ${g.name}
        </button>
    `,
    )
    .join("")
}

function selectGenre(genreId, el) {
  document.querySelectorAll(".genre-btn").forEach((b) => b.classList.remove("selected"))
  el.classList.add("selected")
  currentGenre = genreId
}

function setupMoodButtons() {
  renderMoodButtons()
}

function renderMoodButtons() {
  const container = document.getElementById("mood-buttons")
  container.innerHTML = moods
    .map(
      (m) => `
        <button class="mood-btn" data-mood="${m}" onclick="selectMood('${m}', this)">${m}</button>
    `,
    )
    .join("")
}

function selectMood(mood, el) {
  document.querySelectorAll(".mood-btn").forEach((b) => b.classList.remove("selected"))
  el.classList.add("selected")
  currentMood = mood
}

function setupTimeButtons() {
  renderTimeButtons()
}

function renderTimeButtons() {
  const container = document.getElementById("time-buttons")
  container.innerHTML = times
    .map(
      (t) => `
        <button class="time-btn" data-time="${t}" onclick="selectTime('${t}', this)">${t}</button>
    `,
    )
    .join("")
}

function selectTime(time, el) {
  document.querySelectorAll(".time-btn").forEach((b) => b.classList.remove("selected"))
  el.classList.add("selected")
  currentTime = time
}

async function createPlaylist() {
  const name = document.getElementById("playlist-name-input").value.trim()

  if (!name || !currentGenre) {
    showToast("Bitte Name und Musikrichtung auswählen", "error")
    return
  }

  const playlist = {
    id: Date.now().toString(),
    name: name,
    genre: currentGenre,
    mood: currentMood,
    time: currentTime,
    songs: [],
    dateCreated: new Date().toISOString(),
  }

  try {
    await savePlaylistToDB(playlist)
    playlists.push(playlist)
    renderPlaylists()
    closeModal("create-playlist-modal")
    showToast("Playlist erstellt")
  } catch (error) {
    console.error("Fehler beim Erstellen der Playlist:", error)
    showToast("Fehler beim Erstellen der Playlist", "error")
  }
}

function renderPlaylists() {
  const container = document.getElementById("playlists-grid")

  if (playlists.length === 0) {
    container.innerHTML = '<div class="empty-message">Keine Playlists vorhanden</div>'
    return
  }

  const sorted = [...playlists].sort((a, b) => a.name.localeCompare(b.name))

  container.innerHTML = sorted
    .map((p) => {
      const genre = genres.find((g) => g.id === p.genre)
      return `
            <div class="playlist-card" onclick="openPlaylistDetail('${p.id}')">
                <div class="playlist-image">${genre?.emoji || "🎵"}</div>
                <div class="playlist-info">
                    <div class="playlist-name">${p.name}</div>
                    <div class="playlist-meta">${p.songs.length} Songs • ${genre?.name || "Unbekannt"}</div>
                </div>
            </div>
        `
    })
    .join("")
}

function openPlaylistDetail(playlistId) {
  selectedPlaylistId = playlistId
  renderPlaylistDetail()
  switchSection("playlist-detail-section")
}

function renderPlaylistDetail() {
  const playlist = playlists.find((p) => p.id === selectedPlaylistId)
  if (!playlist) return

  const genre = genres.find((g) => g.id === playlist.genre)
  const songCount = playlist.songs.filter((songId) => songs.find((s) => s.id === songId)).length

  const detailHTML = `
        <div class="detail-header">
            <div class="detail-image">${genre?.emoji || "🎵"}</div>
            <div class="detail-text">
                <h3>${playlist.name}</h3>
                <p>${songCount} Songs • ${genre?.name || "Unbekannt"}</p>
            </div>
        </div>
        <button class="playlist-action-btn play" onclick="playPlaylist()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
            </svg>
            Playlist abspielen
        </button>
        <button class="playlist-action-btn add" onclick="openAddSongsModal()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Songs hinzufügen
        </button>
        <button class="playlist-action-btn delete" onclick="deletePlaylist()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Playlist löschen
        </button>
    `

  document.getElementById("playlist-detail-container").innerHTML = detailHTML
  renderPlaylistSongs()
}

// Delete playlist function
async function deletePlaylist() {
  if (!confirm("Playlist wirklich löschen?")) return

  const playlist = playlists.find((p) => p.id === selectedPlaylistId)
  if (!playlist) return

  try {
    await deletePlaylistFromDB(selectedPlaylistId)
    playlists = playlists.filter((p) => p.id !== selectedPlaylistId)
    selectedPlaylistId = null
    showToast("Playlist gelöscht")
    switchSection("playlists-section")
    renderPlaylists()
  } catch (error) {
    console.error("Fehler beim Löschen der Playlist:", error)
    showToast("Fehler beim Löschen der Playlist", "error")
  }
}

function renderPlaylistSongs() {
  const playlist = playlists.find((p) => p.id === selectedPlaylistId)
  const container = document.getElementById("playlist-songs-list")

  if (!playlist || playlist.songs.length === 0) {
    container.innerHTML = '<div class="empty-message">Keine Songs in dieser Playlist</div>'
    return
  }

  const sortedSongs = playlist.songs
    .map((songId) => songs.find((s) => s.id === songId))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name))

  if (sortedSongs.length === 0) {
    container.innerHTML = '<div class="empty-message">Keine Songs in dieser Playlist</div>'
    return
  }

  container.innerHTML = sortedSongs
    .map(
      (song) => `
        <div class="song-card">
            <div class="song-info">
                <div class="song-name">${song.name}</div>
                <div class="song-meta">${new Date(song.dateAdded).toLocaleDateString("de-DE")}</div>
            </div>
            <div class="song-actions">
                <button class="btn-small ${song.isFavorite ? 'active' : ''}" onclick="toggleFavorite('${song.id}')">
                    ${song.isFavorite ? '❤️' : '🤍'}
                </button>
                <button class="btn-small" onclick="playSongFromPlaylist('${song.id}')">▶</button>
                <button class="btn-small" onclick="editSong('${song.id}')">✏️</button>
                <button class="btn-small btn-danger" onclick="removeSongFromPlaylist('${song.id}')">✕</button>
            </div>
        </div>
    `,
    )
    .join("")
}

// NEW: Render Songs with Playlist Badges
function renderSongs() {
  const container = document.getElementById("songs-list")
  if (!container) return

  let songsToRender = [...songs]

  if (showOnlyFavorites) {
    songsToRender = songsToRender.filter((s) => s.isFavorite)
  }

  if (searchTerm) {
    const term = searchTerm.toLowerCase()
    songsToRender = songsToRender.filter((s) => s.name.toLowerCase().includes(term))
  }

  // Sorting
  songsToRender.sort((a, b) => a.name.localeCompare(b.name))

  if (songsToRender.length === 0) {
    container.innerHTML = '<div class="empty-message">Keine Songs gefunden</div>'
    return
  }

  container.innerHTML = songsToRender
    .map((song) => {
      // Logic for Playlist Badges
      const inPlaylists = playlists
        .filter(p => p.id !== "favorites-auto" && p.songs.includes(song.id)) // Exclude auto-fav playlist from badges to avoid clutter
        .map(p => p.name);

      const badgeHTML = inPlaylists.length > 0
        ? `<div class="song-badges">${inPlaylists.map(name => `<span class="badge">${name}</span>`).join("")}</div>`
        : "";

      return `
        <div class="song-card ${currentSongIndex === songs.indexOf(song) && isPlaying ? "playing" : ""}">
            <div class="song-info" onclick="addToQueue('${song.id}')" style="cursor: pointer;" title="Zur Warteschlange hinzufügen">
                <div class="song-name">${song.name}</div>
                <div class="song-meta">
                    ${new Date(song.dateAdded).toLocaleDateString("de-DE")}
                </div>
                ${badgeHTML}
            </div>
            <div class="song-actions">
                <button class="btn-small ${song.isFavorite ? "active" : ""}" onclick="toggleFavorite('${song.id}')">
                    ${song.isFavorite ? "❤️" : "🤍"}
                </button>
                <button class="btn-small" onclick="playSongFromList('${song.id}')" title="Sofort abspielen">▶</button>
                <button class="btn-small" onclick="editSong('${song.id}')">✏️</button>
                <button class="btn-small btn-danger" onclick="deleteSong('${song.id}')">✕</button>
            </div>
        </div>
    `
    })
    .join("")
}

function openAddSongsModal() {
  renderPlaylistSongSelector()
  document.getElementById("add-to-playlist-modal").classList.add("active")
}

function renderPlaylistSongSelector() {
  const playlist = playlists.find((p) => p.id === selectedPlaylistId)
  const availableSongs = songs
    .filter((s) => !playlist.songs.includes(s.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  const container = document.getElementById("add-playlist-selector")

  if (availableSongs.length === 0) {
    container.innerHTML = '<div class="empty-message">Keine verfügbaren Songs</div>'
    return
  }

  container.innerHTML = availableSongs
    .map(
      (s) => `
        <div class="playlist-option" data-song-id="${s.id}" onclick="toggleSongSelection(this)">
            ${s.name}
        </div>
    `,
    )
    .join("")
}

function toggleSongSelection(el) {
  el.classList.toggle("selected")
}

async function confirmAddToPlaylist() {
  const playlist = playlists.find((p) => p.id === selectedPlaylistId)
  const selected = document.querySelectorAll("#add-playlist-selector .playlist-option.selected")

  selected.forEach((el) => {
    const songId = el.dataset.songId
    if (!playlist.songs.includes(songId)) {
      playlist.songs.push(songId)
    }
  })

  try {
    await savePlaylistToDB(playlist)
    renderPlaylistDetail()
    closeModal("add-to-playlist-modal")
    showToast("Songs hinzugefügt")
  } catch (error) {
    console.error("Fehler beim Hinzufügen von Songs:", error)
    showToast("Fehler beim Hinzufügen von Songs", "error")
  }
}

async function removeSongFromPlaylist(songId) {
  const playlist = playlists.find((p) => p.id === selectedPlaylistId)
  playlist.songs = playlist.songs.filter((id) => id !== songId)

  try {
    await savePlaylistToDB(playlist)
    renderPlaylistDetail()
    showToast("Song entfernt")
  } catch (error) {
    console.error("Fehler beim Entfernen des Songs:", error)
    showToast("Fehler beim Entfernen des Songs", "error")
  }
}

function backToPlaylists() {
  selectedPlaylistId = null
  switchSection("playlists-section")
}

// ============================================
// Player Functions
// ============================================
// Toggle favorites filter
function toggleFavoritesFilter() {
  showOnlyFavorites = !showOnlyFavorites
  const btn = document.getElementById("favorites-filter-btn")
  if (showOnlyFavorites) {
    btn.classList.add("active")
  } else {
    btn.classList.remove("active")
  }
  renderSongs()
}

// New: Search Setup
function setupSearch() {
  const searchInput = document.getElementById("search-input")
  searchInput.addEventListener("input", (e) => {
    searchTerm = e.target.value
    renderSongs()
  })
}

// New: Favorites Logic
// NEW: Auto-Favorites Logic
async function ensureFavoritesPlaylist() {
  let favPlaylist = playlists.find(p => p.id === "favorites-auto");
  if (!favPlaylist) {
    favPlaylist = {
      id: "favorites-auto",
      name: "❤️ Lieblingssongs",
      genre: "classical", // Default
      mood: "Euphorisch",
      time: "",
      songs: [],
      dateCreated: new Date().toISOString()
    };
    await savePlaylistToDB(favPlaylist);
    playlists.push(favPlaylist);
  }
}

async function toggleFavorite(songId) {
  const song = songs.find((s) => s.id === songId)
  if (song) {
    song.isFavorite = !song.isFavorite

    // Update Favorites Playlist
    let favPlaylist = playlists.find(p => p.id === "favorites-auto");
    if (favPlaylist) {
      if (song.isFavorite) {
        if (!favPlaylist.songs.includes(songId)) {
          favPlaylist.songs.push(songId);
        }
      } else {
        favPlaylist.songs = favPlaylist.songs.filter(id => id !== songId);
      }
      await savePlaylistToDB(favPlaylist);
    }

    try {
      await saveSongToDB(song)
      renderSongs()
      if (selectedPlaylistId) renderPlaylistSongs()
      updatePlayerFavoriteUI()
      updateStatisticsDisplay() // Favorites count might change stats
      renderPlaylists(); // Update count on Playlist Card
    } catch (error) {
      console.error("Fehler beim Speichern des Favoriten:", error)
      showToast("Fehler beim Speichern", "error")
    }
  }
}

// New: Shuffle Logic - FISHER YATES
function toggleShuffle() {
  isShuffle = !isShuffle
  const btn = document.getElementById("shuffle-btn")

  if (isShuffle) {
    btn.classList.add("active")

    // If we have a playing song, keep it first, shuffle the rest
    if (playbackQueue.length > 0) {
      const currentSong = playbackQueue[currentQueueIndex];
      // Create new shuffled queue from original (excluding current if possible to be clean, or just full shuffle)
      // Better UX: Shuffle rest of queue.
      // Implementation: Shuffle originalQueue, then find currentSong and move to front?
      // Simpler: Just shuffle originalQueue. Find currentSong. Set index.
      playbackQueue = shuffleArray([...originalQueue]);
      currentQueueIndex = playbackQueue.findIndex(s => s.id === currentSong.id);
      if (currentQueueIndex === -1) {
        currentQueueIndex = 0; // Fallback
      }
    }
    showToast("Zufallswiedergabe an")
  } else {
    btn.classList.remove("active")
    // Restore original order
    if (playbackQueue.length > 0) {
      const currentSong = playbackQueue[currentQueueIndex];
      playbackQueue = [...originalQueue];
      currentQueueIndex = playbackQueue.findIndex(s => s.id === currentSong.id);
      if (currentQueueIndex === -1) currentQueueIndex = 0;
    }
    showToast("Zufallswiedergabe aus")
  }
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// New: Player Favorite Logic
async function toggleCurrentFavorite() {
  if (currentQueueIndex === -1 || !playbackQueue[currentQueueIndex]) return // Use playbackQueue

  const song = playbackQueue[currentQueueIndex] // Use playbackQueue
  await toggleFavorite(song.id)
  updatePlayerFavoriteUI()
}

function updatePlayerFavoriteUI() {
  const btn = document.getElementById("player-favorite-btn")
  if (!btn) return

  if (currentQueueIndex !== -1 && playbackQueue[currentQueueIndex]?.isFavorite) { // Use playbackQueue
    btn.classList.add("active")
    btn.querySelector("svg").style.fill = "currentColor"
  } else {
    btn.classList.remove("active")
    btn.querySelector("svg").style.fill = "none"
  }
}

// Vinyl Animation Helper
function updateVinylAnimation(playing) {
  const record = document.getElementById("vinyl-record")
  const tonearm = document.getElementById("tonearm")

  if (playing) {
    record.classList.add("spinning")
    tonearm.classList.add("playing")
  } else {
    record.classList.remove("spinning")
    // Keep tonearm on record if paused, or move back?
    // User wanted "realistic". Real players keep arm on record when paused (usually).
    // But for visual feedback, let's keep it "playing" state (on record) but stop spin.
    // If we want to simulate "Stop", we would remove the class.
    // For now, let's keep it simple: if playing, arm is on. If paused, arm stays on?
    // Actually, if I remove .playing class, it rotates back.
    // Let's try that for now.
    tonearm.classList.remove("playing")
  }
}

// New: Playback Engine
function setQueue(newSongs) {
  originalQueue = [...newSongs];
  if (isShuffle) {
    playbackQueue = shuffleArray([...originalQueue]);
  } else {
    playbackQueue = [...originalQueue];
  }
}

// ============================================
// Updated Playback Logic for Crossfade
// ============================================
function getActiveAudio() {
  return document.getElementById(activeDeck === 1 ? "audio-player" : "audio-player-2");
}

function getInactiveAudio() {
  return document.getElementById(activeDeck === 1 ? "audio-player-2" : "audio-player");
}

function playSong() {
  if (currentQueueIndex < 0 || playbackQueue.length === 0) return

  // Standard Play (Not Crossfading yet)
  // Ensure we stop the OTHER deck if it was playing (manual song change overrides crossfade)
  const inactive = getInactiveAudio();
  inactive.pause();
  inactive.currentTime = 0;
  isCrossfading = false;

  const song = playbackQueue[currentQueueIndex]
  const audio = getActiveAudio(); // Deck A or B

  try {
    const blob = new Blob([song.data], { type: song.type })
    const url = URL.createObjectURL(blob)

    audio.src = url
    audio.volume = 1; // Reset volume
    audio.play().catch((error) => {
      console.error("Fehler beim Abspielen:", error)
    })

    isPlaying = true

    updatePlayerFavoriteUI()
    updatePlayerDisplay() // Update UI immediately
    updateVinylAnimation(true)

    // Apply Enhancer if active
    if (isEnhancerActive) applySonicEnhancer();

  } catch (error) {
    console.error("Fehler beim Laden des Songs:", error)
    showToast("Fehler beim Laden des Songs", "error")
  }
}

// NEW: Quick Queue Logic
function addToQueue(songId) {
  const song = songs.find(s => s.id === songId);
  if (!song) return;

  // Add to end of queue
  playbackQueue.push(song);

  // Feedback
  showToast(`🎵 In Warteschlange: ${song.name}`, "success");

  // Update visuals
  updatePlayerDisplay(); // Update 1/X count

  // Optional: If nothing is playing and this is the first song, maybe prepare it?
  // Leaving purely as queue action for now as requested.
}

function togglePlay() {
  const audio = getActiveAudio();

  if (isPlaying) {
    audio.pause()
    isPlaying = false
  } else {
    if (!audio.src && playbackQueue.length > 0) {
      playSong()
    } else if (audio.src) {
      audio.play().catch((error) => console.error(error))
      isPlaying = true
    }
  }

  updateVinylAnimation(isPlaying);
  updatePlayButton();
}

function nextSong() {
  // Manual Skip
  if (playbackQueue.length === 0) return

  if (currentQueueIndex < playbackQueue.length - 1) {
    currentQueueIndex++
  } else {
    currentQueueIndex = 0
  }
  // Switch deck not needed for manual skip, just reuse active
  playSong();
}

function previousSong() {
  const audio = getActiveAudio();
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }

  if (playbackQueue.length === 0) return;
  if (currentQueueIndex > 0) {
    currentQueueIndex--
  } else {
    currentQueueIndex = playbackQueue.length - 1
  }
  playSong();
}

function seekTrack() {
  const audio = getActiveAudio();
  if (audio.duration) {
    const progress = document.getElementById("progress-bar").value
    audio.currentTime = (progress / 100) * audio.duration
  }
}

// DUAL AUDIO SETUP
// We attach listeners to BOTH decks, but only the ACTIVE one updates the UI
function setupAudioListener(audio) {

  audio.addEventListener("timeupdate", function () {
    // Only process UI updates if this is the active deck OR if we are crossfading (and this is the incoming one? No, usually outgoing controls UI until swap)
    // Let's say: Active Deck controls UI.
    const isThisActive = (activeDeck === 1 && audio.id === "audio-player") || (activeDeck === 2 && audio.id === "audio-player-2");

    if (isThisActive && this.duration) {
      const progress = (this.currentTime / this.duration) * 100;

      if (!isCrossfading) {
        document.getElementById("progress-bar").value = progress;
        document.getElementById("current-time").textContent = formatTime(this.currentTime);
        document.getElementById("duration-time").textContent = formatTime(this.duration);
      }

      // Crossfade Trigger
      // If we are near end, NOT already crossfading, and there is a next song
      const timeLeft = this.duration - this.currentTime;
      if (timeLeft <= crossfadeDuration && !isCrossfading && isPlaying) {
        triggerCrossfade(); // Start the magic
      }

      // Smart Stats
      if (this.currentTime > 5 && !hasCountedCurrentPlay) {
        if (playbackQueue[currentQueueIndex]) {
          updateSongStatistics(playbackQueue[currentQueueIndex].id);
          hasCountedCurrentPlay = true;
        }
      }
    }
  });

  audio.addEventListener("ended", () => {
    // Fallback: If crossfade failed or song was too short, play next normally
    if (!isCrossfading && isThisActiveDeck(audio)) {
      nextSong();
    }
  })

  // Resume AudioContext on play
  audio.addEventListener("play", () => {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  });
}

function isThisActiveDeck(audio) {
  return (activeDeck === 1 && audio.id === "audio-player") || (activeDeck === 2 && audio.id === "audio-player-2");
}

async function triggerCrossfade() {
  // NEW: Check setting
  if (!flowStateEnabled) return;

  if (playbackQueue.length === 0) return;

  // Determine next index
  let nextIndex = currentQueueIndex + 1;
  if (nextIndex >= playbackQueue.length) nextIndex = 0; // Loop

  const nextSong = playbackQueue[nextIndex];
  if (!nextSong) return;

  // Prepare Inactive Deck
  const inactiveAudio = getInactiveAudio();
  const activeAudio = getActiveAudio();

  console.log("🌊 FLOW STATE: Starting Crossfade to", nextSong.name);
  isCrossfading = true;
  showToast(`🌊 Flow State: ${nextSong.name}`, "success"); // Notify user

  // NEW: Add Animation Class to Player Section
  const playerSection = document.getElementById("player-section");
  if (playerSection) playerSection.classList.add("flow-active");

  // Load next song
  const blob = new Blob([nextSong.data], { type: nextSong.type });
  inactiveAudio.src = URL.createObjectURL(blob);
  inactiveAudio.volume = 0; // Start silent

  await inactiveAudio.play();

  // Perform Fade
  const stepTime = 100; // ms
  const steps = (crossfadeDuration * 1000) / stepTime;
  let currentStep = 0;

  const fadeInterval = setInterval(() => {
    currentStep++;
    const ratio = currentStep / steps; // 0 to 1

    // Linear fade (could be equal power, but linear is fine for basic DJ)
    activeAudio.volume = Math.max(0, 1 - ratio);
    inactiveAudio.volume = Math.min(1, ratio);

    if (currentStep >= steps) {
      clearInterval(fadeInterval);
      finishCrossfade(nextIndex);
    }
  }, stepTime);
}

function finishCrossfade(newIndex) {
  console.log("🌊 Crossfade Complete");

  // NEW: Remove Animation Class
  const playerSection = document.getElementById("player-section");
  if (playerSection) playerSection.classList.remove("flow-active");

  const oldAudio = getActiveAudio();
  oldAudio.pause();
  oldAudio.currentTime = 0;
  oldAudio.volume = 1; // Reset for future

  // Swap Decks
  activeDeck = activeDeck === 1 ? 2 : 1;
  isCrossfading = false;

  // Update State
  currentQueueIndex = newIndex;
  hasCountedCurrentPlay = false; // Reset stats for new song

  // Update UI
  updatePlayerDisplay();
  updatePlayerFavoriteUI();

  // Ensure Enhancer is applied to new active deck (graph is already connected)
  if (isEnhancerActive) applySonicEnhancer();
}

function toggleFlowState() {
  flowStateEnabled = !flowStateEnabled;
  localStorage.setItem("flowStateEnabled", flowStateEnabled); // NEW: Persist
  showToast(`Flow State ${flowStateEnabled ? "Aktiviert" : "Deaktiviert"}`);
}

// UPDATED AUDIO ENGINE FOR DUAL DECKS
function setupAudioEngine(audio1, audio2) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();

    // Create 2 Sources
    sourceNode1 = audioCtx.createMediaElementSource(audio1);
    sourceNode2 = audioCtx.createMediaElementSource(audio2);

    // Rest of the Graph (Same as before)
    bassNode = audioCtx.createBiquadFilter();
    bassNode.type = "lowshelf";
    bassNode.frequency.value = 250;

    midNode = audioCtx.createBiquadFilter();
    midNode.type = "peaking";
    midNode.frequency.value = 1000;
    midNode.Q.value = 0.5;

    trebleNode = audioCtx.createBiquadFilter();
    trebleNode.type = "highshelf";
    trebleNode.frequency.value = 4000;

    compressorNode = audioCtx.createDynamicsCompressor();
    compressorNode.threshold.value = -24;
    compressorNode.ratio.value = 12;

    // Connect BOTH sources to the same Bass Node (Mixer)
    sourceNode1.connect(bassNode);
    sourceNode2.connect(bassNode); // MIXING HAPPENS HERE

    bassNode.connect(midNode);
    midNode.connect(trebleNode);
    trebleNode.connect(compressorNode);
    compressorNode.connect(audioCtx.destination);

    audioGraphSetup = true;

  } catch (e) {
    console.error("Web Audio API Error:", e);
  }
}

// New: Keyboard Shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return // Don't trigger when typing

    switch (e.code) {
      case "Space":
        e.preventDefault()
        togglePlay()
        break
      case "ArrowRight":
        nextSong()
        break
      case "ArrowLeft":
        previousSong()
        break
    }
  })
}

function playSongFromList(songId) {
  // Context: Library (All songs, filtered by search/favorites)
  // Ideally we should queue "visible" songs, but simpler is "all songs"
  // Let's use the current 'songs' array (which is all songs). 
  // If we want to respect filters, we would need to capture the filtered state.
  // User said "Unterschiedliche Reihenfolgen", implying shuffle.

  // Let's queue ALL songs to allow skipping to any song in library.
  setQueue(songs);

  // Find index in the new queue
  // If shuffled, we need to find where the song ended up. 
  // Wait, if we want to play THAT specific song immediately, we must ensure it is playing.
  // If shuffled, it might be anywhere.

  const targetSong = songs.find(s => s.id === songId);
  if (!targetSong) return;

  if (isShuffle) {
    // In shuffle mode, we want to play this song, then continue shuffled.
    // Move target song to index 0? Or just find it.
    // "True Shuffle" usually means: Play this, then random others.
    // Let's find it.
    currentQueueIndex = playbackQueue.findIndex(s => s.id === songId);
  } else {
    currentQueueIndex = playbackQueue.findIndex(s => s.id === songId);
  }

  if (currentQueueIndex !== -1) {
    playSong()
    switchSection("player-section")
  }
}

function playSongFromPlaylist(songId) {
  // Context: Playlist Detail
  const playlist = playlists.find(p => p.id === selectedPlaylistId);
  if (!playlist) return;

  // Map IDs to song objects
  const playlistSongs = playlist.songs
    .map(id => songs.find(s => s.id === id))
    .filter(Boolean);

  setQueue(playlistSongs);

  currentQueueIndex = playbackQueue.findIndex(s => s.id === songId);

  if (currentQueueIndex !== -1) {
    playSong()
    switchSection("player-section")
  }
}

function playPlaylist() {
  const playlist = playlists.find((p) => p.id === selectedPlaylistId)
  if (!playlist || playlist.songs.length === 0) {
    showToast("Keine Songs in der Playlist", "error")
    return
  }

  // Create queue from playlist
  const playlistSongs = playlist.songs
    .map(id => songs.find(s => s.id === id))
    .filter(Boolean);

  setQueue(playlistSongs);
  currentQueueIndex = 0; // Start at beginning (or random if shuffled)

  playSong()
  switchSection("player-section")
}

async function deleteSong(songId) {
  if (!confirm("Song wirklich löschen?")) return

  try {
    await deleteSongFromDB(songId)
    songs = songs.filter((s) => s.id !== songId)

    playlists.forEach((p) => {
      p.songs = p.songs.filter((id) => id !== songId)
    })

    // Save updated playlists
    for (const playlist of playlists) {
      await savePlaylistToDB(playlist)
    }

    renderSongs()
    renderPlaylists()
    updateStorageInfo()

    // Check if deleted song was playing
    // If in queue, remove it.
    // Simplifying: If deleted, just stop playback if it was correct song.
    // Proper: Remove from Global lists.

    showToast("Song gelöscht")
  } catch (error) {
    console.error("Fehler beim Löschen des Songs:", error)
    showToast("Fehler beim Löschen des Songs", "error")
  }
}

// Old playback functions removed to prevent conflicts

function updatePlayerDisplay() {
  // Safe check for queue, fallback to empty
  if (playbackQueue.length === 0 || currentQueueIndex < 0) {
    document.getElementById("player-title").textContent = "Kein Song ausgewählt";
    document.getElementById("player-meta").textContent = "- / -";
    return;
  }

  const song = playbackQueue[currentQueueIndex];
  const audio = getActiveAudio();
  const playBtn = document.getElementById("play-btn"); // Kept variable but logic moved to updatePlayButton
  const playIcon = document.getElementById("play-icon"); // Logic moved to updatePlayButton
  const vinylRecord = document.getElementById("vinyl-record");

  if (song) {
    document.getElementById("player-title").textContent = song.name;
    // CRITICAL FIX: Show index in QUEUE, not Library
    document.getElementById("player-meta").textContent = `${currentQueueIndex + 1} / ${playbackQueue.length}`;
  }

  // Critical: Update Favorite UI
  updatePlayerFavoriteUI();

  updateVinylAnimation(isPlaying);
  updatePlayButton();
}

function updatePlayButton() {
  const playIcon = document.getElementById("play-icon");
  if (!playIcon) return;

  if (isPlaying) {
    playIcon.innerHTML = '<path d="M6 4h4v16H6V4M14 4h4v16h-4V4z"/>'; // Pause icon
  } else {
    playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>'; // Play icon
  }
}

function updateVinylAnimation(shouldSpin) {
  const vinylRecord = document.getElementById("vinyl-record");
  if (!vinylRecord) return;

  if (shouldSpin) {
    vinylRecord.classList.add("spinning");
  } else {
    vinylRecord.classList.remove("spinning");
  }
}

function updatePlayerFavoriteUI() {
  if (playbackQueue.length === 0 || currentQueueIndex < 0) return;
  const song = playbackQueue[currentQueueIndex];
  if (!song) return;

  const btn = document.getElementById("player-favorite-btn");
  if (!btn) return;

  if (song.isFavorite) {
    btn.classList.add("active");
    // GOLD FILLED HEART
    btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="#FFD700" stroke="#FFD700" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      `;
    btn.style.color = "#FFD700";
  } else {
    btn.classList.remove("active");
    // EMPTY HEART
    btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      `;
    btn.style.color = "inherit";
  }
}

// Ensure seekTrack is correct
function seekTrack() {
  const audio = getActiveAudio();
  if (audio.duration) {
    const progress = document.getElementById("progress-bar").value
    audio.currentTime = (progress / 100) * audio.duration
  }
}

function toggleSonicEnhancer() {
  isEnhancerActive = !isEnhancerActive;

  // Resume context if needed (interaction required)
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

  const btn = document.getElementById("sonic-enhance-btn");

  if (isEnhancerActive) {
    btn.classList.add("active");
    applySonicEnhancer();
  } else {
    btn.classList.remove("active");
    resetSonicEnhancer();
    showToast("Original Sound wiederhergestellt");
  }
}

function applySonicEnhancer() {
  if (!audioGraphSetup || !isEnhancerActive) return;

  // Determine Genre
  let profile = SONIC_PROFILES["default"];

  if (playbackQueue.length > 0 && currentQueueIndex >= 0) {
    const song = playbackQueue[currentQueueIndex];
    // We track genre in Playlists, not typically on Songs directly in this simple data model
    // UNLESS we check the playlist the current song belongs to?
    // Or if we stored genre on song? Logic earlier showed genre on Playlist.
    // Let's try to map generic song metadata or fallback to default.
    // Wait, initDatabase added playlists but not genre on song? 
    // Let's see... `saveSongToDB` -> `song` object.
    // User uploads files. We don't extract genre from ID3 yet.
    // BUT, we have `currentGenre` when creating playlists.
    // Let's find if the song is in a playlist with a known genre.

    const containingPlaylist = playlists.find(p => p.songs.includes(song.id));
    if (containingPlaylist && containingPlaylist.genre) {
      const genreKey = containingPlaylist.genre.toLowerCase();
      if (SONIC_PROFILES[genreKey]) {
        profile = SONIC_PROFILES[genreKey];
      } else {
        // Fuzzy match?
        if (genreKey.includes("hop")) profile = SONIC_PROFILES["hiphop"];
        else if (genreKey.includes("rock")) profile = SONIC_PROFILES["rock"];
      }
    }
  }

  // Apply EQ
  // Smooth transition
  const now = audioCtx.currentTime;
  bassNode.gain.setTargetAtTime(profile.bass, now, 0.1);
  midNode.gain.setTargetAtTime(profile.mid, now, 0.1);
  trebleNode.gain.setTargetAtTime(profile.treble, now, 0.1);

  showToast(`✨ Optimiert für ${profile.name}: ${profile.desc}`);
}

function resetSonicEnhancer() {
  if (!audioGraphSetup) return;
  const now = audioCtx.currentTime;
  bassNode.gain.setTargetAtTime(0, now, 0.1);
  midNode.gain.setTargetAtTime(0, now, 0.1);
  trebleNode.gain.setTargetAtTime(0, now, 0.1);
}

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return "0:00"
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

function setupVolumeControl() {
  document.getElementById("volume-control").addEventListener("input", function () {
    document.getElementById("audio-player").volume = this.value / 100
    document.getElementById("volume-value").textContent = this.value + "%"
  })
}

// ============================================
// Modal Management
// ============================================
function renderPlaylistSelector(containerId) {
  const container = document.getElementById(containerId)

  if (playlists.length === 0) {
    container.innerHTML = '<div class="empty-message">Keine Playlists vorhanden. Erstelle zunächst eine!</div>'
    return
  }

  const sorted = [...playlists].sort((a, b) => a.name.localeCompare(b.name))

  container.innerHTML = sorted
    .map(
      (p) => `
        <div class="playlist-option" data-playlist-id="${p.id}" onclick="togglePlaylistSelection(this)">
            ${p.name}
        </div>
    `,
    )
    .join("")
}

function togglePlaylistSelection(el) {
  document.querySelectorAll("#" + el.parentElement.id + " .playlist-option").forEach((e) => {
    e.classList.remove("selected")
  })
  el.classList.add("selected")
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove("active")
}

// ============================================
// Navigation
// ============================================
function switchSection(sectionId, navBtn = null) {
  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"))
  document.getElementById(sectionId).classList.add("active")

  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"))

  if (navBtn) {
    navBtn.classList.add("active")
  } else {
    // Find the corresponding nav button
    const navBtnMap = {
      "upload-section": 0,
      "playlists-section": 1,
      "player-section": 2,
      "statistics-section": 3,
      "settings-section": 4,
    }
    const index = navBtnMap[sectionId]
    if (index !== undefined) {
      document.querySelectorAll(".nav-btn")[index].classList.add("active")
    }
  }
}

function switchStatsTab(tabName) {
  // Remove active from all tabs
  document.querySelectorAll('.stats-tab').forEach(tab => tab.classList.remove('active'))
  document.querySelectorAll('.stats-content').forEach(content => content.classList.remove('active'))

  // Add active to selected tab
  event.target.classList.add('active')
  document.getElementById(`stats-${tabName}`).classList.add('active')

  // Render appropriate content
  if (tabName === 'most-played') {
    renderMostPlayedSongs()
  } else if (tabName === 'recently-played') {
    renderRecentlyPlayed()
  } else if (tabName === 'trends') {
    renderListeningTrends()
  }
}

async function updateStorageInfo() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate()
      const used = estimate.usage
      const quota = estimate.quota
      const percent = Math.round((used / quota) * 100)

      document.getElementById("storage-info").textContent =
        `${(used / 1024 / 1024).toFixed(2)} MB / ${(quota / 1024 / 1024).toFixed(0)} MB (${percent}%)`
    }
  } catch (error) {
    console.error("Fehler beim Abrufen der Speicherinfo:", error)
  }
}

async function clearAllData() {
  if (!confirm("Alle Daten werden gelöscht. Dies kann nicht rückgängig gemacht werden!")) return

  try {
    await clearAllDB()
    songs = []
    playlists = []
    currentSongIndex = 0
    selectedPlaylistId = null

    renderSongs()
    renderPlaylists()
    updateStorageInfo()

    alert("Alle Daten wurden gelöscht")
  } catch (error) {
    console.error("Fehler beim Löschen der Daten:", error)
    alert("Fehler beim Löschen der Daten")
  }
}

// ============================================
// Edit Song Functionality
// ============================================
function editSong(songId) {
  const song = songs.find((s) => s.id === songId)
  if (!song) return

  songToEditId = songId
  document.getElementById("edit-song-name-input").value = song.name
  document.getElementById("edit-song-modal").classList.add("active")
}

async function saveSongTitle() {
  if (!songToEditId) return

  const newName = document.getElementById("edit-song-name-input").value.trim()
  if (!newName) {
    alert("Bitte einen Namen eingeben")
    return
  }

  const song = songs.find((s) => s.id === songToEditId)
  if (song) {
    song.name = newName
    try {
      await saveSongToDB(song)
      renderSongs()
      if (selectedPlaylistId) {
        renderPlaylistDetail()
      }
      updatePlayerDisplay()
      closeModal("edit-song-modal")
      songToEditId = null
    } catch (error) {
      console.error("Fehler beim Speichern des Namens:", error)
      alert("Fehler beim Speichern des Namens")
    }
  }
}

// ============================================
// Statistics Rendering Functions
// ============================================
function renderMostPlayedSongs() {
  const container = document.getElementById("most-played-list")
  if (!container) return

  const sortedByPlays = [...songs]
    .filter(s => s.playCount > 0)
    .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
    .slice(0, 20)

  if (sortedByPlays.length === 0) {
    container.innerHTML = '<div class="empty-message">Noch keine Wiedergaben</div>'
    return
  }

  const maxPlays = sortedByPlays[0].playCount

  container.innerHTML = sortedByPlays.map((song, index) => {
    const barWidth = (song.playCount / maxPlays * 100).toFixed(1)

    // Achievement badges
    let achievement = ''
    if (song.playCount >= 100) achievement = '🔥 Century Club'
    else if (song.playCount >= 50) achievement = '⭐ Super Hit'
    else if (song.playCount >= 20) achievement = '💫 Popular'

    return `
      <div class="stats-song-card">
        <div class="stats-rank">#${index + 1}</div>
        <div class="stats-song-info">
          <div class="stats-song-name">
            ${song.name}
            ${achievement ? `<span class="achievement-badge">${achievement}</span>` : ''}
          </div>
          <div class="stats-song-meta">
            🎵 ${song.playCount} Wiedergaben
          </div>
          <div class="play-count-bar">
            <div class="play-count-fill" style="width: ${barWidth}%"></div>
          </div>
        </div>
        <button class="btn-small" onclick="playSongFromList('${song.id}')">▶</button>
      </div>
    `
  }).join("")
}

function renderRecentlyPlayed() {
  const container = document.getElementById("recently-played-list")
  if (!container) return

  const sortedByRecent = [...songs]
    .filter(s => s.lastPlayed)
    .sort((a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed))
    .slice(0, 20)

  if (sortedByRecent.length === 0) {
    container.innerHTML = '<div class="empty-message">Noch keine Wiedergaben</div>'
    return
  }

  container.innerHTML = sortedByRecent.map(song => {
    const lastPlayed = new Date(song.lastPlayed)
    const timeAgo = getTimeAgo(lastPlayed)
    const timeDiff = new Date() - lastPlayed
    const isRecent = timeDiff < 3600000 // Less than 1 hour

    // Time badge styling
    const timeBadgeClass = isRecent ? 'time-badge recent' : 'time-badge'
    const timeIcon = isRecent ? '🔥' : '⏰'

    return `
      <div class="stats-song-card">
        <div class="stats-song-info">
          <div class="stats-song-name">
            ${song.name}
            ${isRecent ? '<span class="achievement-badge">🔥 Just Played</span>' : ''}
          </div>
          <div class="stats-song-meta">
            <span class="${timeBadgeClass}">${timeIcon} ${timeAgo}</span>
            <span>🎵 ${song.playCount || 0}x gespielt</span>
          </div>
        </div>
        <button class="btn-small" onclick="playSongFromList('${song.id}')">▶</button>
      </div>
    `
  }).join("")
}

function renderListeningTrends() {
  const container = document.getElementById("listening-trends")
  if (!container) return

  const totalPlays = songs.reduce((sum, s) => sum + (s.playCount || 0), 0)
  const songsWithPlays = songs.filter(s => s.playCount > 0).length
  const totalSongs = songs.length
  const avgPlaysPerSong = songsWithPlays > 0 ? (totalPlays / songsWithPlays).toFixed(1) : 0
  const completionRate = totalSongs > 0 ? ((songsWithPlays / totalSongs) * 100).toFixed(0) : 0

  const mostPlayedSong = [...songs].sort((a, b) => (b.playCount || 0) - (a.playCount || 0))[0]

  // Calculate circular progress
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (completionRate / 100) * circumference

  container.innerHTML = `
    <div class="trends-grid">
      <div class="trend-card">
        <div class="trend-value">${totalPlays}</div>
        <div class="trend-label">🎵 Gesamt Wiedergaben</div>
      </div>
      <div class="trend-card">
        <div class="trend-value">${songsWithPlays}</div>
        <div class="trend-label">📀 Songs gespielt</div>
      </div>
      <div class="trend-card">
        <div class="trend-value">${avgPlaysPerSong}</div>
        <div class="trend-label">📊 Ø Wiedergaben/Song</div>
      </div>
      <div class="trend-card">
        <div class="circular-progress">
          <svg width="120" height="120">
            <circle class="bg" cx="60" cy="60" r="${radius}"></circle>
            <circle class="fg" cx="60" cy="60" r="${radius}" 
              stroke-dasharray="${circumference}" 
              stroke-dashoffset="${offset}"></circle>
          </svg>
          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">
            <div class="trend-value" style="font-size: 28px; margin: 0;">${completionRate}%</div>
          </div>
        </div>
        <div class="trend-label">🎯 Bibliothek erkundet</div>
      </div>
      ${mostPlayedSong && mostPlayedSong.playCount > 0 ? `
        <div class="trend-card highlight">
          <div class="trend-value" style="font-size: 20px;">👑 ${mostPlayedSong.name}</div>
          <div class="trend-label">Meistgespielter Song • ${mostPlayedSong.playCount}x wiedergegeben</div>
        </div>
      ` : ''}
    </div>
  `
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000)

  const intervals = {
    Jahr: 31536000,
    Monat: 2592000,
    Woche: 604800,
    Tag: 86400,
    Stunde: 3600,
    Minute: 60
  }

  for (const [name, secondsInInterval] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInInterval)
    if (interval >= 1) {
      return `vor ${interval} ${name}${interval !== 1 ? (name === 'Monat' ? 'en' : name === 'Jahr' ? 'en' : 'n') : ''}`
    }
  }

  return 'gerade eben'
}

// ============================================
// Start Application
// ============================================
init()
