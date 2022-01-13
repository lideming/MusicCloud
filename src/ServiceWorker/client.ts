export const serviceWorkerClient = new class ServiceWorkerClient {
    reg: ServiceWorkerRegistration | null = null;
    async init() {
        if (window.location.protocol == 'https:') {
            try {
                this.reg = await navigator.serviceWorker.register('sw.bundle.js', { scope: '.' });
                console.info('[sw client] service worker registered', this.reg);
            } catch (error) {
                console.error('[sw client] error', error);
            }
        } else {
            console.info('[sw client] non-https protocol, skipping service worker registration');
        }
    }
};
