declare namespace Api {
    interface TrackListIndex {
        lists: TrackListInfo[];
    }

    interface TrackListInfo {
        id: number;
        name: string;
    }

    interface TrackList {
        name: string;
        tracks: Track[];
    }

    interface Track {
        id: number;
        name: string;
        artist: string;
        url: string;
    }
}