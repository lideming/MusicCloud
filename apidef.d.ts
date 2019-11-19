declare namespace Api {
    /** 
     * GET /api/lists/index
     */
    interface TrackListIndex {
        lists: TrackListInfo[];
    }

    interface TrackListInfo {
        id: number;
        name: string;
    }

    /**
     * GET /api/lists/{id}
     */
    interface TrackList {
        id: number;
        name: string;
        tracks: Track[];
    }

    /**
     * GET /api/tracks/{id}
     */
    interface Track {
        id: number;
        name: string;
        artist: string;
        /** URL to audio file */
        url: string;
    }
}