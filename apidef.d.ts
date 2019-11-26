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

    interface TrackList {
        id: number;
        name: string;
    }

    /**
     * GET {api}/lists/{id}
     */
    interface TrackListGet extends TrackList {
        tracks: Track[];
    }

    /**
     * POST/PUT {api}/lists/{id}
     */
    interface TrackListPut extends TrackList {
        trackids: number[];
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
}