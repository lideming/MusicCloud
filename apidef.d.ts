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
     * Create list:
     *   POST {api}/list/-
     * Update list:
     *   PUT {api}/lists/{id}
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
}