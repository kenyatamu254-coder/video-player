/* ============================================
   StreamVault Player Engine
   Custom HTML5 Video Player + Monetag Ad System
   ============================================ */

class StreamVaultPlayer {
  constructor(config) {
    this.videoUrl = config.videoUrl;
    this.container = document.getElementById(config.containerId);
    this.monetagLink = config.monetagLink || 'https://omg10.com/4/11161352';
    this.firstAdAt = config.firstAdAt ?? 5;
    this.adInterval = config.adInterval ?? 20;

    // State
    this.isPlaying = false;
    this.isMuted = false;
    this.isFullscreen = false;
    this.controlsTimeout = null;
    this.shownAdBreakpoints = new Set();
    this.nextAdTime = this.firstAdAt;
    
    this._build();
    this._bindEvents();
  }

  _build() {
    this.playerArea = this.container.querySelector('.sv-player');
    
    this.video = document.createElement('video');
    this.video.preload = 'metadata';
    this.video.playsInline = true;
    this.video.src = this.videoUrl;
    this.playerArea.prepend(this.video);

    this.bigPlay = document.createElement('button');
    this.bigPlay.className = 'sv-big-play';
    this.bigPlay.innerHTML = '&#9654;';
    this.playerArea.appendChild(this.bigPlay);

    this.loader = document.createElement('div');
    this.loader.className = 'sv-loader';
    this.loader.innerHTML = '<div class="sv-spinner"></div>';
    this.playerArea.appendChild(this.loader);

    this.errorScreen = document.createElement('div');
    this.errorScreen.className = 'sv-error';
    this.errorScreen.innerHTML = `
      <span class="sv-error-icon">⚠️</span>
      <span class="sv-error-text">Video failed to load</span>
      <button class="sv-error-retry">Retry</button>
    `;
    this.playerArea.appendChild(this.errorScreen);

    this.adCountdown = document.createElement('div');
    this.adCountdown.className = 'sv-ad-countdown';
    this.playerArea.appendChild(this.adCountdown);

    this.adOverlay = document.createElement('div');
    this.adOverlay.className = 'sv-ad-overlay';
    this.adOverlay.innerHTML = `
      <div class="sv-ad-card">
        <span class="sv-ad-icon">📺</span>
        <div class="sv-ad-title">Brief Pause</div>
        <div class="sv-ad-subtitle">Your video will continue after this brief message.</div>
        <button class="sv-ad-continue-btn">Continue Watching ▶</button>
      </div>
    `;
    this.playerArea.appendChild(this.adOverlay);

    this.controls = document.createElement('div');
    this.controls.className = 'sv-controls';
    this.controls.innerHTML = `
      <div class="sv-progress-container" id="sv-progress">
        <div class="sv-progress-buffered"></div>
        <div class="sv-progress-bar"></div>
        <div class="sv-progress-thumb"></div>
      </div>
      <div class="sv-controls-row">
        <button class="sv-control-btn sv-play-btn">▶</button>
        <div class="sv-volume-group">
          <button class="sv-control-btn sv-vol-btn">🔊</button>
          <input class="sv-volume-slider" type="range" min="0" max="1" step="0.05" value="1">
        </div>
        <span class="sv-time-display"><span class="sv-current-time">0:00</span> / <span class="sv-duration">0:00</span></span>
        <span class="sv-spacer"></span>
        <button class="sv-control-btn sv-fs-btn">⛶</button>
      </div>
    `;
    this.playerArea.appendChild(this.controls);

    this.progressBar = this.controls.querySelector('.sv-progress-bar');
    this.progressBuffered = this.controls.querySelector('.sv-progress-buffered');
    this.progressThumb = this.controls.querySelector('.sv-progress-thumb');
    this.playBtn = this.controls.querySelector('.sv-play-btn');
    this.volBtn = this.controls.querySelector('.sv-vol-btn');
    this.volSlider = this.controls.querySelector('.sv-volume-slider');
    this.currentTimeEl = this.controls.querySelector('.sv-current-time');
    this.durationEl = this.controls.querySelector('.sv-duration');
    this.fsBtn = this.controls.querySelector('.sv-fs-btn');
    this.continueBtn = this.adOverlay.querySelector('.sv-ad-continue-btn');
    this.retryBtn = this.errorScreen.querySelector('.sv-error-retry');
    this.progressContainer = this.controls.querySelector('.sv-progress-container');
  }

  _bindEvents() {
    this.bigPlay.addEventListener('click', () => this.togglePlay());
    this.playBtn.addEventListener('click', () => this.togglePlay());
    this.video.addEventListener('click', () => this.togglePlay());
    this.video.addEventListener('dblclick', (e) => { e.preventDefault(); this.toggleFullscreen(); });

    this.video.addEventListener('play', () => { this.isPlaying = true; this.playBtn.innerHTML = '⏸'; this.bigPlay.classList.add('hidden'); });
    this.video.addEventListener('pause', () => { this.isPlaying = false; this.playBtn.innerHTML = '▶'; });
    this.video.addEventListener('loadedmetadata', () => { this.durationEl.textContent = this._formatTime(this.video.duration); });
    this.video.addEventListener('timeupdate', () => this._onTimeUpdate());
    this.video.addEventListener('progress', () => this._onBufferUpdate());
    this.video.addEventListener('waiting', () => this.loader.classList.add('active'));
    this.video.addEventListener('canplay', () => this.loader.classList.remove('active'));
    this.video.addEventListener('playing', () => this.loader.classList.remove('active'));
    this.video.addEventListener('error', () => this.errorScreen.classList.add('active'));

    this.volBtn.addEventListener('click', () => this.toggleMute());
    this.volSlider.addEventListener('input', (e) => {
      this.video.volume = parseFloat(e.target.value);
      this.video.muted = false;
      this.isMuted = false;
      this.volBtn.innerHTML = this.video.volume === 0 ? '🔇' : '🔊';
    });

    this.fsBtn.addEventListener('click', () => this.toggleFullscreen());
    this.continueBtn.addEventListener('click', () => this._onAdContinue());
    this.retryBtn.addEventListener('click', () => { this.errorScreen.classList.remove('active'); this.video.load(); this.play(); });

    this.playerArea.addEventListener('mousemove', () => this._showControls());
    this.playerArea.addEventListener('mouseleave', () => { if(this.isPlaying) this.controls.classList.add('hidden'); });

    this.progressContainer.addEventListener('click', (e) => {
      const rect = this.progressContainer.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      this.video.currentTime = pos * this.video.duration;
    });
  }

  togglePlay() {
    if (this.isPlaying) this.video.pause();
    else this.video.play();
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.video.muted = this.isMuted;
    this.volSlider.value = this.isMuted ? 0 : this.video.volume;
    this.volBtn.innerHTML = this.isMuted ? '🔇' : '🔊';
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      this.playerArea.requestFullscreen().catch(err => console.log(err));
    } else {
      document.exitFullscreen();
    }
  }

  _onTimeUpdate() {
    const current = this.video.currentTime;
    this.currentTimeEl.textContent = this._formatTime(current);
    
    if (this.video.duration) {
      const percent = (current / this.video.duration) * 100;
      this.progressBar.style.width = `${percent}%`;
      this.progressThumb.style.left = `${percent}%`;
    }

    // --- Monetization Engine ---
    if (!this.adOverlay.classList.contains('active')) {
      const timeToAd = this.nextAdTime - current;
      
      // Show countdown 3 seconds before ad
      if (timeToAd <= 3 && timeToAd > 0.1) {
        this.adCountdown.textContent = `Ad in ${Math.ceil(timeToAd)}...`;
        this.adCountdown.classList.add('visible');
      } else {
        this.adCountdown.classList.remove('visible');
      }

      // Trigger ad
      if (current >= this.nextAdTime && !this.shownAdBreakpoints.has(this.nextAdTime)) {
        this.video.pause();
        if(document.fullscreenElement) document.exitFullscreen(); // Exit FS for pop-up reliability
        this.adCountdown.classList.remove('visible');
        this.adOverlay.classList.add('active');
        this.shownAdBreakpoints.add(this.nextAdTime);
      }
    }
  }

  _onAdContinue() {
    window.open(this.monetagLink, '_blank'); // Open Monetag link
    this.adOverlay.classList.remove('active');
    this.video.play();
    this.nextAdTime += this.adInterval; // Set next trigger 20s later
  }

  _onBufferUpdate() {
    if (this.video.buffered.length > 0) {
      const bufferedEnd = this.video.buffered.end(this.video.buffered.length - 1);
      const duration = this.video.duration;
      if (duration > 0) {
        this.progressBuffered.style.width = `${(bufferedEnd / duration) * 100}%`;
      }
    }
  }

  _showControls() {
    this.controls.classList.remove('hidden');
    clearTimeout(this.controlsTimeout);
    if (this.isPlaying) {
      this.controlsTimeout = setTimeout(() => {
        this.controls.classList.add('hidden');
      }, 3000);
    }
  }

  _formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}