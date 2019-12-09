// file: apidef.d.ts

declare namespace Api {
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
    }

    interface Error {
        error: string;
    }


    //// Another plan for password:
    //
    // /**
    //  * User password is encrypted by HMAC-SHA256 on client-side when
    //  * sending request and storing locally/remotely.
    //  * Neither the server nor crackers can see the plaintext of password.
    //  * 
    //  * When register:
    //  *  1) passwd <- [user input], salt <- random()
    //  *  2) hash <- HMAC(passwd, salt)
    //  *  3) POST hash and salt to register
    //  * 
    //  * When login:
    //  *  1) passwd <- [user input], salt <- [GET from server]
    //  *  2) hash <- HMAC(passwd, salt)
    //  *  3) Use hash to login
    //  */
    // interface PasswordInfo {
    //     passwd_hash?: string;
    //     passwd_salt?: string;
    // }
}