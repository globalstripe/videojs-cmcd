# Video.js CMCD Test Player

A simple webpage to test the ability of Video.js to emit Common Media Client Data (CMCD) for both HLS and DASH playback.

## Overview

This project demonstrates:
- Video.js player setup with HLS and DASH support
- CMCD (Common Media Client Data) plugin that automatically appends CMCD parameters to media requests
- Real-time logging of CMCD data being sent with requests

## Features

- **HLS Playback**: Supports HTTP Live Streaming via the `@videojs/http-streaming` plugin
- **DASH Playback**: Supports Dynamic Adaptive Streaming over HTTP via the `@videojs/http-streaming` plugin
- **CMCD Emission**: Automatically adds CMCD query parameters to all media requests
- **Request Logging**: Visual log of all requests with CMCD data
- **Custom Sources**: Ability to test with custom HLS or DASH URLs

## CMCD Parameters

The plugin emits the following CMCD parameters:

- `sid` - Session ID (unique per player session)
- `cid` - Client ID (persists across sessions via localStorage)
- `br` - Bitrate in kbps (current playback bitrate)
- `tb` - Top bitrate in kbps (maximum available bitrate)
- `d` - Duration in milliseconds
- `ot` - Object type (`m` for manifest, `i` for init segment, `v` for video segment)
- `od` - Object duration in milliseconds (for segments)
- `sf` - Streaming format (`h` for HLS, `d` for DASH)

## Setup

1. **Clone or download this repository**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```
   
   Or directly with Node.js:
   ```bash
   node server.js
   ```

4. **Access the player**
   - Navigate to `http://localhost:8000` (or the port specified in the console)
   - The player will load with a default HLS stream

### Alternative: Direct File Access

You can also open `index.html` directly in a modern web browser, though some features may work better when served through a web server.

## Usage

1. **Select a source**: Use the dropdown to choose between HLS, DASH, or a custom URL
2. **Custom URLs**: Enter your own `.m3u8` (HLS) or `.mpd` (DASH) URL and click "Load"
3. **View CMCD data**: All requests with CMCD parameters are logged in the log panel below the player
4. **Clear log**: Click "Clear Log" to reset the log display
5. **Toggle log**: Click "Toggle Log" to show/hide the log panel

## How It Works

### CMCD Plugin (`cmcd-plugin.js`)

The CMCD plugin intercepts network requests made by the Video.js http-streaming plugin and appends CMCD query parameters. It:

1. Generates a unique session ID (`sid`) for each player session
2. Maintains a persistent client ID (`cid`) in localStorage
3. Calculates bitrate information from the current playlist/quality level
4. Determines object type based on the URL (manifest, init segment, or video segment)
5. Appends CMCD data as a query parameter: `?CMCD=br=2500,ot=v,...`

### Request Interception

The plugin hooks into the `beforeRequest` callback of the http-streaming plugin's XHR handler, allowing it to modify requests before they are sent.

## Browser Compatibility

- Modern browsers with HTML5 video support
- Requires JavaScript enabled
- For HLS/DASH playback, the `@videojs/http-streaming` plugin handles browser compatibility

## Testing CMCD

To verify CMCD data is being sent:

1. Open browser Developer Tools (F12)
2. Go to the Network tab
3. Filter by "Media" or search for `.m3u8`, `.mpd`, `.m4s`, or `.ts`
4. Click on any request to view details
5. Check the "Request URL" - you should see `CMCD=...` in the query string

## Example CMCD Output

```
CMCD=br=2500,tb=5000,d=60000,ot=v,od=6000,sf=h,sid="s1234567890-abc123",cid="c1234567890-xyz789"
```

# Quality Menu

Implemented based on videojs-contrib-quality-menu@latest/dist/videojs-contrib-quality-menu.min.js

With a few tweaks to the CSS.  More required

## References

- [Video.js Documentation](https://videojs.com/)
- [Video.js HTTP Streaming Plugin](https://github.com/videojs/http-streaming)
- [CMCD Specification](https://cdn.cta.tech/cta/media/media/resources/standards/pdfs/cta-5004-final.pdf)
- [CTA-5004 Common Media Client Data](https://www.cta.tech/cta/media/docs/default-source/standards/cta-5004-final.pdf)

## License

This is a test/demo project. The Video.js library and plugins are subject to their respective licenses.

