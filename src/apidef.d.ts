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
        name: string;
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
        trackids: number[];
    }

    interface TrackListPutResult extends TrackListInfo {

    }

    /**
     * GET {api}/tracks/{id}
     */
    interface Track {
        id: number;
        name: string;
        artist: string;
        /** URL to audio file */
        url: string;
        size?: number;
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

        /** When PUT */
        listids?: number[];

        /** When register */
        passwd?: string;

        /** When GET me */
        servermsg?: string;

        /** When GET me */
        playing?: Api.TrackLocation;

        /** When GET me */
        role?: 'admin' | 'user';

        /** When GET me */
        storageUrlBase?: string;

        /** When GET me/login */
        token?: string;
    }

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
    }

    // POST {api}/tracks/uploadrequest
    // request:
    interface UploadRequest {
        filename: string;
        size: number;
    }
    // response:
    type UploadParameters = {
        mode: 'direct';
    } | {
        mode: 'put-url';
        url: string;
        method: 'POST' | 'PUT';
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
}