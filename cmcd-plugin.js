/**
 * Video.js CMCD Plugin
 * Emits Common Media Client Data (CMCD) for HLS and DASH playback
 * 
 * CMCD Specification: https://cdn.cta.tech/cta/media/media/resources/standards/pdfs/cta-5004-final.pdf
 */

(function(window, videojs) {
  'use strict';

  /**
   * CMCD Plugin
   * @param {Object} options - Plugin options
   */
  var cmcdPlugin = function(options) {
    var player = this;
    var logCallback = options.logCallback || function() {};
    var valuesCallback = options.valuesCallback || function() {};
    
    // CMCD session data (persists across requests)
    var sessionData = {
      sid: generateSessionId(),
      cid: null, // Will be set based on manifest URL
      v: 1 // CMCD version
    };

    // State tracking
    var requestCount = 0;
    var lastSegmentIndex = -1;
    var metadataLoaded = false;
    var waitingEventFired = false;
    var startup = false;
    var bufferStarvation = false;
    var currentSourceUrl = null;

    /**
     * Generate a unique session ID (UUID-like)
     */
    function generateSessionId() {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
      // Fallback UUID generation
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }

    /**
     * Generate Content ID from manifest URL (hash)
     */
    function generateContentId(url) {
      if (!url) return null;
      // Simple hash function
      var hash = 0;
      for (var i = 0; i < url.length; i++) {
        var char = url.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      return 'c' + Math.abs(hash).toString(36);
    }

    /**
     * Get encoded bitrate (br) in kbps
     */
    function getEncodedBitrate(player) {
      var tech = player.tech();
      if (tech && tech.vhs) {
        var currentPlaylist = tech.vhs.playlists && tech.vhs.playlists.media();
        if (currentPlaylist) {
          // For HLS
          if (currentPlaylist.attributes && currentPlaylist.attributes.BANDWIDTH) {
            return Math.round(currentPlaylist.attributes.BANDWIDTH / 1000);
          }
          // For DASH
          if (currentPlaylist.attributes && currentPlaylist.attributes.bandwidth) {
            return Math.round(currentPlaylist.attributes.bandwidth / 1000);
          }
        }
      }
      return null;
    }

    /**
     * Get buffer length (bl) in milliseconds
     */
    function getBufferLength(player) {
      var tech = player.tech();
      if (!tech) return null;
      
      var buffered = tech.buffered();
      if (!buffered || buffered.length === 0) return 0;
      
      var currentTime = player.currentTime();
      var lastBufferedEnd = 0;
      
      // Find the buffered range that contains currentTime
      for (var i = 0; i < buffered.length; i++) {
        if (buffered.start(i) <= currentTime && buffered.end(i) >= currentTime) {
          lastBufferedEnd = buffered.end(i);
          break;
        }
      }
      
      // If we have a last segment index, use that
      if (lastSegmentIndex >= 0 && lastSegmentIndex < buffered.length) {
        lastBufferedEnd = buffered.end(lastSegmentIndex);
      }
      
      return Math.round((lastBufferedEnd - currentTime) * 1000);
    }

    /**
     * Get object duration (d) in milliseconds
     */
    function getObjectDuration(player, url, isInit) {
      // Object duration is for the entire media presentation, not individual segments
      // According to spec: "The duration of the media object in milliseconds"
      // For segments, this would be the segment duration
      if (url.includes('.m3u8') || url.includes('.mpd')) {
        // For manifest, return total duration
        var duration = player.duration();
        if (duration && isFinite(duration)) {
          return Math.round(duration * 1000);
        }
        return null;
      }
      
      if (isInit) {
        return null; // Init segments don't have duration
      }
      
      // For video segments, get segment duration
      var tech = player.tech();
      if (tech && tech.vhs) {
        var currentPlaylist = tech.vhs.playlists && tech.vhs.playlists.media();
        if (currentPlaylist && currentPlaylist.segments) {
          // Use the segment that's being requested (based on last segment index + 1)
          var targetIndex = lastSegmentIndex >= 0 ? lastSegmentIndex + 1 : getCurrentSegmentIndex(player);
          if (targetIndex >= 0 && targetIndex < currentPlaylist.segments.length) {
            var segment = currentPlaylist.segments[targetIndex];
            if (segment && segment.duration) {
              return Math.round(segment.duration * 1000);
            }
          }
          // Fallback: use first segment duration if available
          if (currentPlaylist.segments.length > 0 && currentPlaylist.segments[0].duration) {
            return Math.round(currentPlaylist.segments[0].duration * 1000);
          }
        }
      }
      return null;
    }

    /**
     * Get current segment index
     */
    function getCurrentSegmentIndex(player) {
      var tech = player.tech();
      if (!tech || !tech.vhs) return -1;
      
      var currentPlaylist = tech.vhs.playlists && tech.vhs.playlists.media();
      if (!currentPlaylist || !currentPlaylist.segments) return -1;
      
      var currentTime = player.currentTime();
      var segmentTime = 0;
      
      for (var i = 0; i < currentPlaylist.segments.length; i++) {
        var segment = currentPlaylist.segments[i];
        var segmentDuration = segment.duration || 0;
        if (currentTime >= segmentTime && currentTime < segmentTime + segmentDuration) {
          return i;
        }
        segmentTime += segmentDuration;
      }
      
      return -1;
    }

    /**
     * Get next object request (nor)
     */
    function getNextObjectRequest(player, url) {
      // Only for VOD streams
      var duration = player.duration();
      if (!isFinite(duration)) return null; // Live stream
      
      var tech = player.tech();
      if (!tech || !tech.vhs) return null;
      
      var currentPlaylist = tech.vhs.playlists && tech.vhs.playlists.media();
      if (!currentPlaylist || !currentPlaylist.segments) return null;
      
      var segmentIndex = getCurrentSegmentIndex(player);
      if (segmentIndex >= 0 && segmentIndex < currentPlaylist.segments.length - 1) {
        var nextSegment = currentPlaylist.segments[segmentIndex + 1];
        if (nextSegment && nextSegment.resolvedUri) {
          return nextSegment.resolvedUri;
        }
        if (nextSegment && nextSegment.uri) {
          // Resolve relative URI
          var baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
          return baseUrl + nextSegment.uri;
        }
      }
      
      return null;
    }

    /**
     * Get top bitrate (tb) in kbps
     */
    function getTopBitrate(player) {
      var tech = player.tech();
      if (tech && tech.vhs) {
        var masterPlaylist = tech.vhs.playlists && tech.vhs.playlists.master;
        if (masterPlaylist) {
          var maxBitrate = 0;
          // For HLS
          if (masterPlaylist.playlists) {
            masterPlaylist.playlists.forEach(function(playlist) {
              if (playlist.attributes && playlist.attributes.BANDWIDTH) {
                maxBitrate = Math.max(maxBitrate, playlist.attributes.BANDWIDTH);
              }
            });
          }
          // For DASH - check representations
          if (masterPlaylist.attributes && masterPlaylist.attributes.representations) {
            masterPlaylist.attributes.representations.forEach(function(rep) {
              if (rep.bandwidth) {
                maxBitrate = Math.max(maxBitrate, rep.bandwidth);
              }
            });
          }
          if (maxBitrate > 0) {
            return Math.round(maxBitrate / 1000);
          }
        }
      }
      return null;
    }

    /**
     * Get measured throughput (mtp) in kbps
     */
    function getMeasuredThroughput(player) {
      var tech = player.tech();
      if (tech && tech.vhs && tech.vhs.systemBandwidth) {
        return Math.round(tech.vhs.systemBandwidth / 1000);
      }
      return null;
    }

    /**
     * Get object type (ot)
     */
    function getObjectType(url, isInit) {
      if (url.includes('.m3u8') || url.includes('.mpd')) {
        return 'm'; // manifest
      } else if (isInit || url.includes('init')) {
        return 'i'; // init segment
      } else if (url.includes('.ts') || url.includes('.m4s')) {
        return 'v'; // video segment
      } else if (url.includes('.aac') || url.includes('audio')) {
        return 'a'; // audio only
      }
      return 'v'; // default to video
    }

    /**
     * Get streaming format (sf)
     */
    function getStreamingFormat(player) {
      var currentType = player.currentType();
      if (currentType && currentType.includes('mpegURL')) {
        return 'h'; // HLS
      } else if (currentType && currentType.includes('dash')) {
        return 'd'; // DASH
      }
      // Fallback: check URL
      var src = player.currentSrc();
      if (src) {
        if (src.includes('.m3u8')) return 'h';
        if (src.includes('.mpd')) return 'd';
      }
      return 'o'; // other
    }

    /**
     * Get stream type (st)
     */
    function getStreamType(player) {
      var duration = player.duration();
      return isFinite(duration) ? 'v' : 'l'; // VOD or Live
    }

    /**
     * Get deadline (dl) in milliseconds
     */
    function getDeadline(player) {
      var bufferLength = getBufferLength(player);
      if (bufferLength === null || bufferLength === 0) return null;
      
      var playbackRate = player.playbackRate();
      if (!playbackRate || playbackRate === 0) return null;
      
      return Math.round((bufferLength / playbackRate) * 1000);
    }

    /**
     * Build complete CMCD data object
     */
    function buildCMCDData(player, url, isInit) {
      var cmcd = {};
      var tech = player.tech();
      
      // Session data (always include)
      cmcd.sid = sessionData.sid;
      cmcd.cid = sessionData.cid;
      cmcd.v = sessionData.v;
      
      // Streaming format (session)
      var sf = getStreamingFormat(player);
      if (sf) cmcd.sf = sf;
      
      // Stream type (session)
      var st = getStreamType(player);
      if (st) cmcd.st = st;
      
      // Playback rate (session)
      var pr = player.playbackRate();
      if (pr && pr !== 1) cmcd.pr = pr;
      
      // Encoded bitrate (object)
      var br = getEncodedBitrate(player);
      if (br !== null) cmcd.br = br;
      
      // Top bitrate (object)
      var tb = getTopBitrate(player);
      if (tb !== null) cmcd.tb = tb;
      
      // Object type (object)
      var ot = getObjectType(url, isInit);
      if (ot) cmcd.ot = ot;
      
      // Object duration (object) - only for video/audio segments
      if (ot === 'v' || ot === 'a') {
        var d = getObjectDuration(player, url, isInit);
        if (d !== null && d > 0) cmcd.d = d;
      }
      
      // Buffer length (request)
      var bl = getBufferLength(player);
      if (bl !== null && bl >= 0) cmcd.bl = bl;
      
      // Deadline (request)
      var dl = getDeadline(player);
      if (dl !== null && dl > 0) cmcd.dl = dl;
      
      // Measured throughput (request)
      var mtp = getMeasuredThroughput(player);
      if (mtp !== null && mtp > 0) cmcd.mtp = mtp;
      
      // Next object request (request) - only for segments
      if (ot === 'v' || ot === 'a') {
        var nor = getNextObjectRequest(player, url);
        if (nor) cmcd.nor = nor;
      }
      
      // Startup (request)
      if (startup) {
        cmcd.su = true;
        startup = false; // Reset after first use
      }
      
      // Buffer starvation (status)
      if (bufferStarvation) {
        cmcd.bs = true;
      }
      
      return cmcd;
    }

    /**
     * Build CMCD query string
     */
    function buildCMCDQuery(cmcdData) {
      var queryParts = [];
      Object.keys(cmcdData).forEach(function(key) {
        var value = cmcdData[key];
        if (value !== null && value !== undefined) {
          if (typeof value === 'string') {
            queryParts.push(key + '="' + encodeURIComponent(value) + '"');
          } else if (typeof value === 'boolean') {
            queryParts.push(key + '=' + (value ? 'true' : 'false'));
          } else {
            queryParts.push(key + '=' + value);
          }
        }
      });

      return queryParts.length > 0 ? 'CMCD=' + encodeURIComponent(queryParts.join(',')) : '';
    }

    /**
     * Intercept and modify requests
     */
    function interceptRequests() {
      var tech = player.tech();
      
      if (!tech) {
        return;
      }

      // VHS (Video HTTP Streaming) - used by http-streaming plugin for both HLS and DASH
      if (tech.vhs) {
        // Check if xhr object exists and hasn't been intercepted yet
        if (tech.vhs.xhr && !tech.vhs.xhr._cmcdIntercepted) {
          var originalBeforeRequest = tech.vhs.xhr.beforeRequest;
          
          tech.vhs.xhr.beforeRequest = function(options) {
            requestCount++;
            var isInit = options.uri && (options.uri.includes('init') || 
                                         options.uri.includes('Initialization') ||
                                         options.uri.includes('init.mp4'));
            var url = options.uri || options.url || '';
            
            // Update segment index if this is a segment request (before building CMCD data)
            // This helps us determine which segment is being requested
            if (!isInit && (url.includes('.ts') || url.includes('.m4s'))) {
              // Try to extract segment number from URL or estimate based on current time
              var segmentMatch = url.match(/seg[_-]?(\d+)/i) || url.match(/(\d+)\.(ts|m4s)/);
              if (segmentMatch) {
                lastSegmentIndex = parseInt(segmentMatch[1], 10) - 1; // Convert to 0-based
              } else {
                // Fallback: estimate based on current playback position
                lastSegmentIndex = getCurrentSegmentIndex(player);
              }
            }
            
            // Build CMCD data
            var cmcdData = buildCMCDData(player, url, isInit);
            var cmcdQuery = buildCMCDQuery(cmcdData);
            
            if (cmcdQuery) {
              var separator = url.indexOf('?') === -1 ? '?' : '&';
              var newUrl = url + separator + cmcdQuery;
              
              // Update the URI/URL
              if (options.uri) {
                options.uri = newUrl;
              }
              if (options.url) {
                options.url = newUrl;
              }
              
              // Call callbacks
              logCallback({
                type: 'request',
                url: newUrl,
                method: options.method || 'GET',
                cmcd: cmcdQuery,
                timestamp: new Date().toISOString()
              });
              
              valuesCallback(cmcdData);
            }
            
            // Call original beforeRequest if it exists
            if (originalBeforeRequest) {
              var result = originalBeforeRequest.call(this, options);
              return result !== undefined ? result : options;
            }
            
            return options;
          };
          
          // Mark as intercepted to avoid multiple interceptions
          tech.vhs.xhr._cmcdIntercepted = true;
        }
      }
    }

    // Event handlers
    player.on('loadstart', function() {
      currentSourceUrl = player.currentSrc();
      if (currentSourceUrl) {
        sessionData.cid = generateContentId(currentSourceUrl);
      }
      metadataLoaded = false;
      waitingEventFired = false;
      startup = true;
      bufferStarvation = false;
      lastSegmentIndex = -1;
      interceptRequests();
    });

    player.on('loadedmetadata', function() {
      metadataLoaded = true;
      startup = true;
    });

    player.on('waiting', function() {
      waitingEventFired = true;
      bufferStarvation = true;
    });

    player.on('canplay', function() {
      bufferStarvation = false;
    });

    // Wait for player to be ready
    player.ready(function() {
      interceptRequests();
    });

    // Re-intercept on source changes
    player.on('loadstart', interceptRequests);
  };

  // Register the plugin
  videojs.registerPlugin('cmcd', cmcdPlugin);

})(window, window.videojs);
