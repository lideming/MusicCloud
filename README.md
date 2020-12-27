# MusicCloud

MusicCloud is a music website.

This repo contains the frontend parts of MusicCloud.

[Backend source repo](https://github.com/lideming/MusicCloudServer) is also on GitHub.


## Features

* Music player
* Single-page application
* Upload and manage tracks
* Tracklists on the cloud
* Lyrics with translation and ruby annotations, extended from LRC.
* Comment and discussion
* Todo:
    - [ ] Player control UI rework
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
npm install -g rollup
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
* `src/Lyrics.ts` - Lyrics parser (LRC compatible)
