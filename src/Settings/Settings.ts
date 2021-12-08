export const settings = {
    defaultApiBaseUrl: 'api/',
    apiBaseUrl: '',
    debug: true,
    apiDebugDelay: 0,
    showDownloadOptions: true,
    showDiscussion: true,
    showNotes: true,

    init() {
        var server = localStorage.getItem('mcloud-server');
        this.apiBaseUrl = server || this.defaultApiBaseUrl;
    }
};
