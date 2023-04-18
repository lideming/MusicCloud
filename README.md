# MusicCloud

MusicCloud is a music website built with [webfx](https://github.com/lideming/webfx).

This repo contains the frontend parts of MusicCloud.

[The server](https://github.com/lideming/MusicCloudServer) is also open-sourced.
You can easily [run your own MusicCloud instance in Docker](https://github.com/lideming/MusicCloudServer#run-in-docker-).

[![Build](https://github.com/lideming/MusicCloud/actions/workflows/main.yml/badge.svg)](https://github.com/lideming/MusicCloud/actions/workflows/main.yml)

## Features

- Music player
- Single-page application
- Upload and manage tracks
- Share tracks and playlists
- Search tracks
- Lyrics with translation and ruby annotations, extended from LRC.
- Comment and discussion
- Login with OpenID Connect
- More in [TODO](https://github.com/lideming/MusicCloud/projects/1)

## Configure Build

Modify `src/Settings/Settings.ts` for API location, debug options etc.

## Build

Though `npm` may still work, we use [pnpm](https://pnpm.io/) as the package manager.

Install `pnpm` if needed, see [pnpm docs](https://pnpm.io/installation) for more examples:

```
npx pnpm add -g pnpm
```

Install development dependencies:

```
pnpm install
```

Start the building process:

```
pnpm build
```

## Deploy

Copy `dist/*` to the static website folder (see `staticdir` in [server side configration](https://github.com/lideming/MusicCloudServer/blob/master/appsettings.json)).

## Reusable Components

- [webfx](https://github.com/lideming/webfx) - Web UI framework with utilities and basic views
- `src/Lyrics/Lyrics.ts` - Lyrics parser/serializer (LRC with optional MusicCloud extension)
