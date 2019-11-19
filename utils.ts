var utils = new class {
    toggleClass(element: HTMLElement, clsName: string, force?: boolean) {
        if (force === undefined) force = !element.classList.contains(clsName);
        if (force) element.classList.add(clsName);
        else element.classList.remove(clsName);
    }
    strPaddingLeft(str: string, len: number, ch: string = ' ') {
        while (str.length < len) {
            str = ch + str;
        }
        return str;
    }
    formatTime(sec: number) {
        if (isNaN(sec)) return '--:--';
        var sec = Math.floor(sec);
        var min = Math.floor(sec / 60);
        sec %= 60;
        return this.strPaddingLeft(min.toString(), 2, '0') + ':' + this.strPaddingLeft(sec.toString(), 2, '0');
    }
    numLimit(num: number, min: number, max: number) {
        return (num < min || typeof num != 'number' || isNaN(num)) ? min :
            (num > max) ? max : num;
    }
    Timer = class {
        callback: () => void;
        cancelFunc: () => void;
        constructor(callback: () => void) {
            this.callback = callback;
        }
        timeout(time) {
            var handle = setTimeout(this.callback, time);
            this.cancelFunc = () => window.clearTimeout(handle);
        }
        interval(time) {
            var handle = setInterval(this.callback, time);
            this.cancelFunc = () => window.clearInterval(handle);
        }
        tryCancel() {
            if (this.cancelFunc) this.cancelFunc();
        }
    }
    buildDOM: (tree: BuildDomExpr) => BuildDomReturn;
    clearChilds(node: Node) {
        while (node.lastChild) node.removeChild(node.lastChild);
    }
    replaceChild(node: Node, newChild: Node) {
        this.clearChilds(node);
        if (newChild) node.appendChild(newChild);
    }
    sleepAsync(time: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(resolve, time);
        });
    }
}

type BuildDomExpr = BuildDomTag | BuildDomNode | HTMLElement | Node;

type BuildDomTag = string;

type BuildDomReturn = HTMLElement | Text | Node;

interface BuildDomNode {
    tag: BuildDomTag;
    child?: BuildDomExpr[];
    [key: string]: any;
}

utils.buildDOM = (() => {
    var createElementFromTag = function (tag: string): HTMLElement {
        var reg = /[#\.^]?[\w\-]+/y;
        var match;
        var ele;
        while (match = reg.exec(tag)) {
            var val = match[0];
            var ch = val[0];
            if (ch == '.') {
                ele.classList.add(val.substr(1));
            } else if (ch == '#') {
                ele.id = val.substr(1);
            } else {
                if (ele) throw new Error('unexpected multiple tags');
                ele = document.createElement(val);
            }
        }
        return ele;
    };

    var buildDomCore = function (obj: BuildDomExpr, ttl: number): BuildDomReturn {
        if (ttl-- < 0) throw new Error('ran out of TTL');
        if (typeof (obj) === 'string') return document.createTextNode(obj);
        if (Node && obj instanceof Node) return obj as Node;
        var node = createElementFromTag((obj as BuildDomNode).tag);
        for (var key in obj) {
            if (key != 'tag' && obj.hasOwnProperty(key)) {
                var val = obj[key];
                if (key == 'child') {
                    if (val instanceof Array) {
                        val.forEach(function (x) {
                            node.appendChild(buildDomCore(x, ttl));
                        });
                    } else {
                        node.appendChild(buildDomCore(val, ttl));
                    }
                } else {
                    node[key] = val;
                }
            }
        }
        return node;
    };

    return function (obj: BuildDomExpr): BuildDomReturn {
        return buildDomCore(obj, 32);
    };
})()

type Action = () => void;
