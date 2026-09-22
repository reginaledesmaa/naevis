# NAEVIS 🎵

**Find your frequency. Find your people.**

NAEVIS is a responsive social web app concept that connects people through shared music tastes, artists and genres.

## Features

- Responsive interface with HTML, CSS, JavaScript and Bootstrap.
- Music taste and artist search using the Spotify Web API.
- Spotify Authorization Code with PKCE for browser authentication.
- Real Spotify playback in the browser through the Spotify Web Playback SDK.
- Play/pause, previous, next, seek and volume controls.
- Search Spotify tracks and play them inside the NAEVIS player.
- Current song, artist, album cover and playback progress update dynamically.
- Demo discover, matches, friends and profile flows.
- Optional Now Playing privacy and reactions.

## Spotify setup

1. Create a Spotify Developer app.
2. Copy the **Client ID** into `config.js`.
3. Add the exact NAEVIS URL as a Spotify Redirect URI.
4. Open NAEVIS through a web server, such as VS Code Live Server, or GitHub Pages.
5. Connect Spotify from the NAEVIS interface.
6. A Spotify Premium account is required for Web Playback and playback-control features.

The browser implementation uses Authorization Code with PKCE, so **do not put a Spotify Client Secret in this repository**.

For local development, use an exact redirect such as `http://127.0.0.1:5500/` if that is the URL used by your local server. For GitHub Pages, use the exact HTTPS URL shown by GitHub Pages.

## Important

The identity verification screen is only a prototype UI; it does not collect or store official identity documents. Match, friends and compatibility data are demo data for the school project.

Spotify playback features depend on Spotify account eligibility, browser support and Spotify's current developer policies.
