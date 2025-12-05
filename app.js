/**
 * Main application script for Video.js CMCD Test Player
 */

(function() {
  'use strict';

  // Initialize player
  var player = videojs('my-video', {
    fluid: false,
    responsive: false,
    width: '100%',
    height: 600,
    html5: {
      vhs: {
        overrideNative: true
      },
      nativeVideoTracks: false,
      nativeAudioTracks: false,
      nativeTextTracks: false
    }
  });

  // Sample video sources
  var sources = {
    hls: {
      src: 'https://cloudfront.content-steering.com/bbb_hls/master_steering_cloudfront_https_cdn-b_cdn-c_cdn-a.m3u8',
      type: 'application/x-mpegURL'
    },
    dash: {
      src: 'https://cloudfront.content-steering.com/bbb/playlist_steering_cloudfront_https_cdn-b_cdn-a_cdn-c.mpd',
      type: 'application/dash+xml'
    },
    GCORE_VOD_DASH: {
      src: 'https://vod-gcore.5g-emerge.io/TOS/CMAF/TearsOfSteel.mpd',
      type: 'application/dash+xml'
    },
    GCORE_VOD_HLS: {
      src: 'https://vod-gcore.5g-emerge.io/TOS/CMAF/TearsOfSteel.m3u8',
       type: 'application/x-mpegURL'
    },
    GCORE_LIVE_HLS: {
      src: 'https://live.5g-emerge.io/out/v1/759cad6035bc478295768c354436b26f/CMAF_HLS/index.m3u8',
      type: 'application/x-mpegURL'
    },
    GCORE_LIVE_DASH: {
      src: 'https://live.5g-emerge.io/out/v1/b8d4460f49274298b038c1b40c160e7d/index.mpd',
      type: 'application/dash+xml'
    }
  };

  // CMCD log management
  var logContainer = document.getElementById('log-content');
  var logVisible = true;
  var valuesContainer = document.getElementById('cmcd-values-content');

  // CMCD value definitions
  var cmcdValueDefinitions = [
    { key: 'br', label: 'Encoded Bitrate', type: 'CMCD-Object', unit: 'kbps' },
    { key: 'bl', label: 'Buffer Length', type: 'CMCD-Request', unit: 'ms' },
    { key: 'bs', label: 'Buffer Starvation', type: 'CMCD-Status', unit: 'boolean' },
    { key: 'cid', label: 'Content ID', type: 'CMCD-Session', unit: 'string' },
    { key: 'd', label: 'Object Duration', type: 'CMCD-Object', unit: 'ms' },
    { key: 'dl', label: 'Deadline', type: 'CMCD-Request', unit: 'ms' },
    { key: 'mtp', label: 'Measured Throughput', type: 'CMCD-Request', unit: 'kbps' },
    { key: 'nor', label: 'Next Object Request', type: 'CMCD-Request', unit: 'string' },
    { key: 'ot', label: 'Object Type', type: 'CMCD-Object', unit: 'token' },
    { key: 'pr', label: 'Playback Rate', type: 'CMCD-Session', unit: 'decimal' },
    { key: 'sf', label: 'Streaming Format', type: 'CMCD-Session', unit: 'token' },
    { key: 'sid', label: 'Session ID', type: 'CMCD-Session', unit: 'string' },
    { key: 'st', label: 'Stream Type', type: 'CMCD-Session', unit: 'token' },
    { key: 'su', label: 'Startup', type: 'CMCD-Request', unit: 'boolean' },
    { key: 'tb', label: 'Top Bitrate', type: 'CMCD-Object', unit: 'kbps' },
    { key: 'v', label: 'CMCD Version', type: 'CMCD-Session', unit: 'integer' }
  ];

  // Initialize CMCD values display
  function initializeCMCDValuesDisplay() {
    valuesContainer.innerHTML = '';
    cmcdValueDefinitions.forEach(function(def) {
      var item = document.createElement('div');
      item.className = 'cmcd-value-item';
      item.id = 'cmcd-value-' + def.key;
      item.innerHTML = 
        '<div class="cmcd-value-label">' + def.label + '</div>' +
        '<div class="cmcd-value-key">' + def.key + ' (' + def.type + ')</div>' +
        '<div class="cmcd-value-data" id="cmcd-data-' + def.key + '">-</div>';
      valuesContainer.appendChild(item);
    });
  }

  // Update CMCD values display
  function updateCMCDValues(cmcdData) {
    cmcdValueDefinitions.forEach(function(def) {
      var dataElement = document.getElementById('cmcd-data-' + def.key);
      if (dataElement) {
        var value = cmcdData[def.key];
        if (value !== null && value !== undefined) {
          var displayValue = value;
          
          // Format based on type
          if (def.unit === 'boolean') {
            displayValue = value ? 'true' : 'false';
            dataElement.className = 'cmcd-value-data boolean-' + displayValue;
          } else if (def.unit === 'token') {
            // Map token values to readable format
            if (def.key === 'ot') {
              var otMap = { 'm': 'manifest', 'i': 'init', 'v': 'video', 'a': 'audio', 'av': 'audio+video', 'c': 'caption', 'tt': 'text track', 'k': 'key', 'o': 'other' };
              displayValue = value + ' (' + (otMap[value] || value) + ')';
            } else if (def.key === 'sf') {
              var sfMap = { 'd': 'DASH', 'h': 'HLS', 's': 'Smooth Streaming', 'o': 'other' };
              displayValue = value + ' (' + (sfMap[value] || value) + ')';
            } else if (def.key === 'st') {
              var stMap = { 'v': 'VOD', 'l': 'Live' };
              displayValue = value + ' (' + (stMap[value] || value) + ')';
            }
            dataElement.className = 'cmcd-value-data';
          } else {
            dataElement.className = 'cmcd-value-data';
          }
          
          dataElement.textContent = displayValue;
        } else {
          dataElement.textContent = '-';
          dataElement.className = 'cmcd-value-data';
        }
      }
    });
  }

  function addLogEntry(entry) {
    if (!logVisible) return;
    
    var logDiv = document.createElement('div');
    logDiv.className = 'log-entry';
    
    var time = new Date(entry.timestamp).toLocaleTimeString();
    var logText = '[' + time + '] ' + entry.method + ' ' + entry.url;
    
    if (entry.cmcd) {
      logText += '\n  CMCD: ' + decodeURIComponent(entry.cmcd);
    }
    
    logDiv.textContent = logText;
    logContainer.appendChild(logDiv);
    
    // Auto-scroll to bottom
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  function clearLog() {
    logContainer.innerHTML = '';
  }

  // Initialize CMCD plugin with logging and values callback
  player.ready(function() {
    initializeCMCDValuesDisplay();
    player.cmcd({
      logCallback: addLogEntry,
      valuesCallback: updateCMCDValues
    });
    
    // Initialize quality menu plugin
    if (player.qualityMenu) {
      player.qualityMenu({
        useResolutionLabels: true,
        resolutionLabelBitrates: true
      });
    }
  });

  // Source selector
  var sourceSelect = document.getElementById('source-select');
  var customUrlContainer = document.getElementById('custom-url-container');
  var customUrlInput = document.getElementById('custom-url');
  var loadCustomBtn = document.getElementById('load-custom');

  sourceSelect.addEventListener('change', function() {
    if (this.value === 'custom') {
      customUrlContainer.style.display = 'block';
    } else {
      customUrlContainer.style.display = 'none';
      loadSource(this.value);
    }
  });

  function loadSource(sourceType) {
    if (sources[sourceType]) {
      player.src(sources[sourceType]);
      addLogEntry({
        type: 'info',
        method: 'INFO',
        url: 'Loading ' + sourceType.toUpperCase() + ' source: ' + sources[sourceType].src,
        timestamp: new Date().toISOString()
      });
    }
  }

  loadCustomBtn.addEventListener('click', function() {
    var url = customUrlInput.value.trim();
    if (url) {
      var type = url.includes('.m3u8') ? 'application/x-mpegURL' : 
                 url.includes('.mpd') ? 'application/dash+xml' : 
                 'video/mp4';
      
      player.src({
        src: url,
        type: type
      });
      
      addLogEntry({
        type: 'info',
        method: 'INFO',
        url: 'Loading custom source: ' + url,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Function to force quality menu to align left
  function alignQualityMenuLeft() {
    // Try multiple selectors to find the menu
    var menuSelectors = [
      '.vjs-quality-menu .vjs-menu-popup',
      '.vjs-quality-menu .vjs-menu',
      '.vjs-quality-menu .vjs-menu-content',
      '.vjs-quality-menu-button .vjs-menu-popup',
      '.vjs-quality-menu-button .vjs-menu',
      '.vjs-quality-menu-button .vjs-menu-content'
    ];
    
    menuSelectors.forEach(function(selector) {
      var menuElements = document.querySelectorAll(selector);
      menuElements.forEach(function(menuElement) {
        if (menuElement) {
          // Force left alignment - override any inline styles
          menuElement.style.setProperty('left', '0', 'important');
          menuElement.style.setProperty('right', 'auto', 'important');
          menuElement.style.setProperty('transform', 'translateX(0)', 'important');
          menuElement.style.setProperty('margin-left', '0', 'important');
          menuElement.style.setProperty('margin-right', 'auto', 'important');
          menuElement.style.setProperty('position', 'absolute', 'important');
        }
      });
    });
  }
  
  // Continuously monitor and reposition menu when visible
  function startMenuRepositioning() {
    setInterval(function() {
      // Check if menu is visible
      var menu = document.querySelector('.vjs-quality-menu .vjs-menu-popup, .vjs-quality-menu .vjs-menu');
      if (menu && menu.offsetParent !== null) {
        // Menu is visible, reposition it
        alignQualityMenuLeft();
      }
    }, 100); // Check every 100ms
  }

  // Reinitialize quality menu when source changes
  player.on('loadstart', function() {
    // Wait a bit for the source to fully load before initializing quality menu
    setTimeout(function() {
      if (player.qualityMenu) {
        try {
          player.qualityMenu({
            useResolutionLabels: true,
            resolutionLabelBitrates: true
          });
          // Force left alignment after initialization
          setTimeout(alignQualityMenuLeft, 100);
        } catch (e) {
          // Quality menu might already be initialized, which is fine
          console.log('Quality menu initialization:', e.message);
        }
      }
    }, 500);
  });

  // Watch for menu show events to reposition
  player.ready(function() {
    // Start continuous repositioning
    startMenuRepositioning();
    
    // Use a MutationObserver to watch for menu appearance
    var observer = new MutationObserver(function() {
      alignQualityMenuLeft();
    });
    
    // Observe the control bar for changes
    if (player.controlBar && player.controlBar.el()) {
      observer.observe(player.controlBar.el(), {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    }
    
    // Also listen for click events on the quality button
    setTimeout(function() {
      var qualityButton = document.querySelector('.vjs-quality-menu-button');
      if (qualityButton) {
        qualityButton.addEventListener('click', function() {
          // Reposition immediately and multiple times to catch dynamic positioning
          alignQualityMenuLeft();
          setTimeout(alignQualityMenuLeft, 10);
          setTimeout(alignQualityMenuLeft, 50);
          setTimeout(alignQualityMenuLeft, 100);
        });
      }
    }, 1000);
  });

  // Control buttons
  document.getElementById('clear-log').addEventListener('click', clearLog);
  
  var toggleLogBtn = document.getElementById('toggle-log');
  toggleLogBtn.addEventListener('click', function() {
    logVisible = !logVisible;
    var cmcdLog = document.getElementById('cmcd-log');
    if (logVisible) {
      cmcdLog.classList.remove('hidden');
      toggleLogBtn.textContent = 'Hide';
    } else {
      cmcdLog.classList.add('hidden');
      toggleLogBtn.textContent = 'Show';
    }
  });

  // Load default source (HLS)
  player.ready(function() {
    loadSource('hls');
  });

  // Log player events for debugging
  player.on('loadstart', function() {
    console.log('Player: loadstart');
  });

  player.on('loadedmetadata', function() {
    console.log('Player: loadedmetadata');
  });

  player.on('loadeddata', function() {
    console.log('Player: loadeddata');
  });

  player.on('error', function() {
    var error = player.error();
    console.error('Player error:', error);
    addLogEntry({
      type: 'error',
      method: 'ERROR',
      url: 'Player error: ' + (error ? error.message : 'Unknown error'),
      timestamp: new Date().toISOString()
    });
  });

})();

