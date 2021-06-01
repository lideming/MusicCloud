# MusicCloud

MusicCloud is a music website built with [webfx](https://github.com/lideming/webfx).

This repo contains the frontend parts of MusicCloud.

[The server](https://github.com/lideming/MusicCloudServer) is also open-sourced.
You can easily [run your own MusicCloud instance in Docker](https://github.com/lideming/MusicCloudServer#run-in-docker-).

[![Build](https://github.com/lideming/MusicCloud/actions/workflows/main.yml/badge.svg)](https://github.com/lideming/MusicCloud/actions/workflows/main.yml)


## Features

* Music player
* Single-page application
* Upload and manage tracks
* Share tracks and playlists
* Search tracks
* Lyrics with translation and ruby annotations, extended from LRC.
* Comment and discussion
* Todo:
    - [ ] Player control UI rework
    - [ ] Search playlists and users
    - [ ] Front page
    - [ ] Albums
    - [ ] Cross-device interaction
    - [ ] Quick switching bitrate
    - [ ] Cache management
    - [ ] Offline usability


## Configure Build

Modify `src/Settings.ts` for API location, debug options etc.


## Build

Ensure development dependencies are installed:

```
npm install
```

Start the building process:

```
npm run build
```

Then `bundle.js` should be generated from source files.


## Deploy

Copy `index.html` and `bundle.js` to the static website folder (see `staticdir` in [server side configration](https://github.com/lideming/MusicCloudServer/blob/master/appsettings.json)).

Note that `style.css` is included in `bundle.js`.


## Reusable Components

* [webfx](https://github.com/lideming/webfx) - Web UI framework with utilities and basic views
* `src/Lyrics.ts` - Lyrics parser/serializer (LRC with optional MusicCloud extension)
