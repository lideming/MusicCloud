var helpers = {
    toggleClass(element: HTMLElement, clsName: string, force?: boolean){
        if (force === undefined) force = !element.classList.contains(clsName);
        if (force) element.classList.add(clsName);
        else element.classList.remove(clsName);
    }
}

var ui = {
    bottomBar: {
        container: document.getElementById("bottombar"),
        toggle(state?: boolean) {
            helpers.toggleClass(ui.bottomBar.container, 'show', state);
        },
        init() {
            var bar = ui.bottomBar.container;
            bar.addEventListener('mouseenter', () => {
                ui.bottomBar.toggle(true);
            });
            bar.addEventListener('mouseleave', ()=>{
                ui.bottomBar.toggle(false);
            });
        }
    },
    progressBar: {
        container: document.getElementById('progressbar'),
        fill: document.getElementById('progressbar-fill'),
        setProg(prog: number) {
            if (typeof prog != 'number' || prog < 0) prog = 0;
            else if (prog > 1) prog = 1;
            ui.progressBar.fill.style.width = (prog * 100) + '%';
        }
    }
};

ui.bottomBar.init();

class PlayerCore {
    private audio: HTMLAudioElement;
    constructor() {
        this.audio = document.createElement('audio');
        this.audio.addEventListener('timeupdate', (e) => {
            ui.progressBar.setProg(this.audio.currentTime / this.audio.duration);
        });
    }
    playUrl(src: string) {
        this.audio.src = src;
        this.audio.play();
    }
    play() {
        this.audio.play();
    }
    pause() {
        this.audio.pause();
    }
}

var playerCore = new PlayerCore();
