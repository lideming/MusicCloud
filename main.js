var helpers = {
    toggleClass: function (element, clsName, force) {
        if (force === undefined)
            force = !element.classList.contains(clsName);
        if (force)
            element.classList.add(clsName);
        else
            element.classList.remove(clsName);
    }
};
var ui = {
    bottomBar: {
        container: document.getElementById("bottombar"),
        toggle: function (state) {
            helpers.toggleClass(ui.bottomBar.container, 'show', state);
        },
        init: function () {
            var bar = ui.bottomBar.container;
            bar.addEventListener('mouseenter', function () {
                ui.bottomBar.toggle(true);
            });
            bar.addEventListener('mouseleave', function () {
                ui.bottomBar.toggle(false);
            });
        }
    },
    progressBar: {
        container: document.getElementById('progressbar'),
        fill: document.getElementById('progressbar-fill'),
        setProg: function (prog) {
            if (typeof prog != 'number' || prog < 0)
                prog = 0;
            else if (prog > 1)
                prog = 1;
            ui.progressBar.fill.style.width = (prog * 100) + '%';
        }
    }
};
ui.bottomBar.init();
var PlayerCore = /** @class */ (function () {
    function PlayerCore() {
        var _this = this;
        this.audio = document.createElement('audio');
        this.audio.addEventListener('timeupdate', function (e) {
            ui.progressBar.setProg(_this.audio.currentTime / _this.audio.duration);
        });
    }
    PlayerCore.prototype.playUrl = function (src) {
        this.audio.src = src;
        this.audio.play();
    };
    PlayerCore.prototype.play = function () {
        this.audio.play();
    };
    PlayerCore.prototype.pause = function () {
        this.audio.pause();
    };
    return PlayerCore;
}());
var playerCore = new PlayerCore();
window.onkeydown = function (e) {
    console.log(e);
    if (e.keyCode == 32) {
        ui.bottomBar.toggle();
    }
};
