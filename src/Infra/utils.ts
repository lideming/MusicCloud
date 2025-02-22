import { Callbacks, Action, numLimit, View } from "@yuuza/webfx";
export * from "@yuuza/webfx";

export const isIOS = /\s(iPhone|iPad|iPod)\s/.test(navigator.userAgent);

export class ScrollAnimator {
  constructor(readonly view: View) {
    this.view.dom.addEventListener("scroll", (e) => {
      if (e.target === view.dom) {
        if (this.scrollEventPending) {
          this.scrollEventPending = false;
        } else {
          this.onUserScroll.invoke(e);
          this.cancel();
        }
      }
    });
  }
  duration = 300;
  private beginTime = -1;
  beginPos = 0;
  lastPos = 0;
  targetPos = 0;
  private _rafHandle = -1;
  posType: "top" | "center" = "top";
  scrollEventPending = false; // position was changed by this animator
  onUserScroll = new Callbacks<Action<Event>>();
  get currentPos() {
    if (this.posType == "center")
      return this.view.dom.scrollTop + this.view.dom.offsetHeight / 2;
    else return this.view.dom.scrollTop;
  }
  set currentPos(val: number) {
    var targetPos = val;
    if (this.posType == "center") targetPos -= this.view.dom.offsetHeight / 2;
    if (this.view.dom.scrollTop != targetPos) {
      this.scrollEventPending = true;
      this.view.dom.scrollTop = targetPos;
    }
  }
  cancel() {
    if (this._rafHandle >= 0) {
      cancelAnimationFrame(this._rafHandle);
      this._rafHandle = -1;
    }
  }
  scrollTo(pos: number) {
    this.targetPos = pos;
    this.lastPos = this.beginPos = this.currentPos;
    if (this._rafHandle < 0) {
      this._startRaf();
    }
    this.beginTime = performance.now();
  }
  private _rafCallback = null as Action<number> | null;
  private _startRaf() {
    if (!this._rafCallback) {
      this._rafCallback = (now) => {
        if (this._render(now)) {
          this._rafHandle = requestAnimationFrame(this._rafCallback!);
        } else {
          this._rafHandle = -1;
        }
      };
    }
    this._rafHandle = requestAnimationFrame(this._rafCallback);
  }
  private _render(now: number): boolean {
    if (Math.abs(this.currentPos - this.lastPos) > 10) return false;

    const t = numLimit((now - this.beginTime) / this.duration, 0, 1);

    const pos =
      this.beginPos + (this.targetPos - this.beginPos) * this._easeInOutQuad(t);
    this.lastPos = pos;

    this.currentPos = pos;

    return t !== 1;
  }
  private _easeInOutQuad(t: number) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }
}

interface SiType<T> {
  serialize: (obj: T) => string;
  deserialize: (str: string) => T;
}

export class SettingItem<T> {
  key: string;
  type: SiType<T>;
  data: T;
  isInitial: boolean;
  onRender: Action<T> | null = null;
  constructor(
    key: string,
    type: "bool" | "str" | "json" | SiType<T>,
    initial: T
  ) {
    this.key = key;
    type = this.type =
      typeof type === "string" ? SettingItem.types[type] : type;
    if (!type || !type.serialize || !type.deserialize)
      throw new Error("invalid 'type' arugment");
    this.readFromStorage(initial);
  }
  readFromStorage(initial: T) {
    var str = this.key ? localStorage.getItem(this.key) : null;
    this.isInitial = !str;
    this.set(str ? this.type.deserialize(str) : initial, true);
  }
  render(fn: (obj: T) => void, dontRaiseNow?: boolean) {
    if (!dontRaiseNow) fn(this.data);
    const oldFn = this.onRender;
    const newFn = fn;
    if (oldFn)
      fn = function (x) {
        oldFn(x);
        newFn(x);
      };
    this.onRender = fn;
    return this;
  }
  bindToBtn(btn: HTMLElement, prefix: string[]) {
    if ((this.type as any) !== SettingItem.types.bool)
      throw new Error("only for bool type");
    var span = document.createElement("span");
    btn.insertBefore(span, btn.firstChild);
    this.render(function (x) {
      btn.classList.toggle("disabled", !x);
      prefix = prefix || ["❌", "✅"];
      span.textContent = prefix[+x];
    });
    var thiz = this;
    btn.addEventListener("click", function () {
      thiz.toggle();
    });
    return this;
  }
  remove() {
    localStorage.removeItem(this.key);
  }
  save() {
    this.isInitial = false;
    localStorage.setItem(this.key, this.type.serialize(this.data));
  }
  set(data: T, dontSave?: boolean) {
    this.data = data;
    this.isInitial = false;
    this.onRender && this.onRender(data);
    if (!dontSave && this.key) this.save();
  }
  get() {
    return this.data;
  }
  toggle() {
    if ((this.type as any) !== SettingItem.types.bool)
      throw new Error("only for bool type");
    this.set(!(this.data as any) as any);
  }
  loop(arr: any[]) {
    var curData = this.data;
    var oldIndex = arr.findIndex(function (x) {
      return x === curData;
    });
    var newData = arr[(oldIndex + 1) % arr.length];
    this.set(newData);
  }

  static types = {
    bool: {
      serialize: function (data) {
        return data ? "true" : "false";
      },
      deserialize: function (str) {
        return str === "true" ? true : str === "false" ? false : undefined;
      },
    },
    str: {
      serialize: function (x) {
        return x;
      },
      deserialize: function (x) {
        return x;
      },
    },
    json: {
      serialize: function (x) {
        return JSON.stringify(x);
      },
      deserialize: function (x) {
        return JSON.parse(x);
      },
    },
  };
}
