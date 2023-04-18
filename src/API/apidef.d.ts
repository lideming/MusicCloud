// file: apidef.d.ts

export namespace Api {
  /**
   * GET {api}/lists/index
   */
  interface TrackListIndex {
    lists: TrackListInfo[];
  }

  interface TrackListInfo {
    id: number;
    owner: number;
    ownerName?: string;
    name: string;
    picurl?: string;
    visibility: number;
    version: number;
  }

  /**
   * GET {api}/lists/{id}
   */
  interface TrackListGet extends TrackListInfo {
    tracks: Track[];
  }

  /**
   * [Create list]
   * POST {api}/lists/-
   *
   * [Update list]
   * PUT {api}/lists/{id}
   */
  interface TrackListPut extends TrackListInfo {
    trackids?: number[];
  }

  interface TrackListPutResult extends TrackListInfo {}

  /**
   * GET {api}/tracks/{id}
   */
  interface Track {
    id: number;
    owner?: number;
    name: string;
    type?: "audio" | "video";
    artist: string;
    album?: string;
    albumArtist?: string;
    /** URL to audio file */
    url: string;
    picurl?: string;
    thumburl?: string;
    lyrics?: string;
    size?: number;
    length?: number;
    groupId?: number;
    files?: TrackFile[];
    version?: number;
    visibility?: number;
  }

  interface TrackFile {
    profile: string;
    /** Bitrate in kbps */
    bitrate: number;
    format: string;
    size: number;
  }

  /**
   * GET {api}/tracks/{id}/lyrics
   */
  interface TrackLyrics {
    lyrics: string;
  }

  /**
   * [Get info of existing user]
   * GET {api}/users/me
   * GET {api}/users/{id}
   * GET {api}/users/{username}
   *
   * [Update info of existing user]
   * PUT {api}/users/me
   *
   * [Register a new user]
   * POST {api}/users/new
   */
  interface UserInfo {
    username: string;

    /** When GET */
    id?: number;
    /** When GET */
    lists?: TrackListInfo[];
    /** When GET */
    avatar?: string;

    /** When PUT */
    listids?: number[];

    /** When register */
    passwd?: string;

    /** When GET me */
    playing?: Api.TrackLocation;

    /** When GET me */
    role?: "admin" | "user";

    /** When GET me */
    serverOptions?: ServerConfig;

    /** When POST me/login */
    token?: string;
  }

  /**
   * [Get server configuration about enabled features, login methods, etc.]
   */
  interface ServerConfig {
    msg?: string;
    storageUrlBase?: string;
    notesEnabled?: boolean;
    discussionEnabled?: boolean;
    trackCommentsEnabled?: boolean;

    passwordLogin?: boolean;
    allowRegistration?: boolean;
    socialLogin?: SocialLoginConfig[];
  }

  interface SocialLoginConfig {
    id: string;
    name: string;
    icon: string;
  }
  // To start social login:
  // GET {api}/users/me/socialLogin?provider={id}&returnUrl={url} with no body
  // After the user completes the login,
  // the server will redirect to the returnUrl with #token={token}

  interface Error {
    error: string;
  }

  // GET {api}/comments/{key}?[begin={id}][end={id}][limit={}]
  interface CommentList {
    comments: Comment[];
    /** Zero or undefined means no more comments */
    next: number;
  }

  interface Comment {
    id: number;
    uid: number;
    username: string;
    date: string;
    content: string;
  }

  // GET/POST {api}/users/me/playing
  interface TrackLocation {
    listid: number;
    position: number;
    trackid: number;
    track?: Track;
    profile?: string;
  }

  // POST {api}/tracks/uploadrequest
  // request:
  interface UploadRequest {
    filename: string;
    size: number;
  }
  // response:
  type UploadParameters =
    | {
        mode: "direct";
      }
    | {
        mode: "put-url";
        url: string;
        method: "POST" | "PUT";
        tag: string;
      };

  // POST {api}/tracks/uploadresult
  // request:
  interface UploadResult {
    url: string;
    filename: string;
    tag: string;
  }
  // response: Api.Track

  // POST {api}/tracks/visibility
  // request:
  interface VisibilityChange {
    trackids: number[];
    visibility: number;
  }

  // GET {api}/tracks/group/{id}
  interface TrackGroup {
    tracks: Track;
  }
}
