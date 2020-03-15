// file: Lyrics.ts

export function parse(str: string) {
    var time = new Date().getTime();
    var r = new Parser(str).parse();
    console.log(`Lyrics: parsed ${str.length} chars in ${new Date().getTime() - time} ms`);
    return r;
}

class LookaheadBuffer<T> {
    consumed = 0;
    buf: T[] = [];
    provider: () => T;
    consume() {
        var item = this.peek(0);
        this.buf.shift();
        this.consumed++;
        return item;
    }
    peek(i?: number) {
        if (i === undefined) i = 0;
        while (this.buf.length <= i) {
            this.buf.push(this.provider());
        }
        return this.buf[i];
    }
}

const TAGBEGIN = '['.charCodeAt(0);
const TAGEND = ']'.charCodeAt(0);
const BRACKETBEGIN = '{'.charCodeAt(0);
const BRACKETEND = '}'.charCodeAt(0);
const NOTLINEFEED = '\r'.charCodeAt(0);
const LINEFEED = '\n'.charCodeAt(0);

const mapCharToken = {
    [TAGBEGIN]: T.tagBegin,
    [TAGEND]: T.tagEnd,
    [BRACKETBEGIN]: T.bracketBegin,
    [BRACKETEND]: T.bracketEnd,
    [NOTLINEFEED]: null, // ignored charater
    [LINEFEED]: T.lineFeed
};

class Lexer {
    buf = new LookaheadBuffer<Token>();
    str: string;
    cur = 0;
    get len() { return this.str.length; }
    constructor(str: string) {
        this.str = str;
        this.buf.provider = () => {
            return this.read();
        };
    }
    toArray() {
        for (var i = 0; this.buf.peek(i).type !== T.eof; i++) { }
        return this.buf.buf.map(x => x);
    }
    lastToken: Token;
    read(): Token {
        var token = this.readCore();
        // console.debug('token', token, this.cur);
        this.lastToken = token;
        return token;
    }
    readCore(): Token {
        var str = this.str;
        var begin = this.cur;
        var cur = this.cur;
        try {
            if (cur == str.length)
                return new Token(T.eof);
            while (true) {
                var ch = str.charCodeAt(cur);
                cur++;
                if (!(ch >= 0)) return new Token(T.eof, 'eof');
                const tokenType = mapCharToken[ch];
                if (tokenType !== undefined) {
                    if (tokenType === null) continue; // ignore charater
                    return new Token(tokenType, ch);
                }
                while (true) {
                    ch = str.charCodeAt(cur);
                    if (!(ch >= 0) || mapCharToken[ch] !== undefined)
                        break;
                    cur++;
                };
                return new Token(T.text, str.substring(begin, cur));
            }
        } finally {
            this.cur = cur;
        }
    }

    peek(pos?: number) { return this.buf.peek(pos); }
    consume() { return this.buf.consume(); }
    tryExpect(type: TokenType, pos?: number) {
        var t = this.peek(pos);
        if (t.type === type) return t;
        return null;
    }
    tryExpectSeq(types: TokenType[]) {
        var i = 0;
        for (const t of types) {
            if (!this.tryExpect(t, i++))
                return false;
        }
        return true;
    }
    expect(type: TokenType) {
        var t = this.tryExpect(type);
        if (!t) this.error(`expected token type '${TokenTypeEnum[type]}'`);
        return t;
    }
    error(msg?: string): never {
        throw new Error((msg ?? 'error') + ' at ' + this.peek());
    }
    expectAndConsume(type: TokenType) {
        this.expect(type);
        return this.consume();
    }
}

type TokenType = T;

enum TokenTypeEnum {
    ['tagBegin'] = 1,
    ['tagEnd'],
    ['bracketBegin'],
    ['bracketEnd'],
    ['text'],
    ['lineFeed'],
    ['eof'],
}

const enum T {
    ['tagBegin'] = 1,
    ['tagEnd'],
    ['bracketBegin'],
    ['bracketEnd'],
    ['text'],
    ['lineFeed'],
    ['eof'],
}

class Token {
    type: TokenType;
    val: string;
    constructor(type: TokenType, val?: string | number) {
        this.type = type;
        this.val = typeof val == 'number' ? String.fromCharCode(val) : val;
    }
    toString() {
        return `{${TokenTypeEnum[this.type]}|${this.val}}`;
    }
}

export class Parser {
    lex: Lexer;
    tokens: LookaheadBuffer<Token>;
    lines: Line[] = [];
    bpm = 60;
    offset = 0;
    curTime = 0;
    lang = '';
    tlang = '';
    constructor(str: string) {
        this.lex = new Lexer(str);
        this.tokens = this.lex.buf;
    }
    parse(): Lyrics {
        var lex = this.lex;
        var lastpos: number;
        this.skipLineFeeds();
        while (lex.peek().type !== T.eof) {
            lastpos = lex.buf.consumed;
            this.parseLine();
            this.skipLineFeeds();
            if (lex.buf.consumed === lastpos) {
                this.parseLine();
                lex.error('parseLine() doesn\'t consume tokens');
            }
        }
        this.lines.sort((a, b) => a.startTime - b.startTime);
        return {
            lines: this.lines,
            lang: this.lang,
            translationLang: this.tlang
        };
    }
    parseLine() {
        var lex = this.lex;
        var startTime: number = null;
        var duplicateTime: number[] = [];
        var spans: Span[] = [];
        var trans: string = null;
        var lastSpan: Span = null;
        var curTime: number = null;
        while (true) {
            if (lex.tryExpect(T.tagBegin)) {
                lex.consume();
                let text = lex.expectAndConsume(T.text).val;
                let ts = this.parseTimestamp(text, curTime ?? this.curTime);
                if (typeof ts == 'number') {
                    lex.expectAndConsume(T.tagEnd);
                    if (!lastSpan) {
                        if (startTime != null) {
                            duplicateTime.push(ts);
                        } else {
                            curTime = ts;
                            startTime = ts;
                        }
                    } else {
                        curTime = ts;
                        lastSpan.endTime = ts;
                    }
                } else if (lex.tryExpectSeq([T.tagEnd, T.bracketBegin])) {
                    lex.consume(); lex.consume();
                    let ruby = lex.expectAndConsume(T.text).val;
                    lex.expectAndConsume(T.bracketEnd);
                    spans.push(lastSpan = { text, ruby, startTime: curTime, endTime: null });
                } else if (text.startsWith('bpm:')) {
                    this.bpm = parseFloat(text.substr(4));
                    lex.expectAndConsume(T.tagEnd);
                } else if (text.startsWith('offset:')) {
                    this.offset = parseFloat(text.substr(7)) / 1000;
                    lex.expectAndConsume(T.tagEnd);
                } else if (text.startsWith('lang:')) {
                    let r = /^([\w\-]+)(\/([\w\-]+))?$/.exec(text.substr(5));
                    if (r) {
                        this.lang = r[1];
                        this.tlang = r[3] || '';
                    }
                    lex.expectAndConsume(T.tagEnd);
                } else {
                    if (!lastSpan) {
                        // unknown tag at the beginning of the line, so skip this line.
                        this.skipLine();
                        return;
                    } else {
                        spans.push(lastSpan = { text: '[' + text + ']', ruby: null, startTime: curTime, endTime: null });
                        if (lex.tryExpect(T.tagEnd)) lex.consume();
                    }
                }
            } else if (lex.tryExpect(T.text)) {
                let text = lex.consume().val;
                spans.push(lastSpan = { text, ruby: null, startTime: curTime, endTime: null });
            } else if (lex.tryExpect(T.lineFeed)) {
                lex.consume();
                if (spans.length > 0 && lex.tryExpect(T.text)) {
                    let nextline = lex.peek().val;
                    if (nextline.startsWith('/')) {
                        trans = nextline.substr(1);
                        lex.consume();
                    }
                }
                break;
            } else if (lex.tryExpect(T.eof)) {
                break;
            } else {
                this.skipLine();
                break;
            }
        }
        if (startTime === null && spans.length === 0) return;
        if (curTime != null) this.curTime = curTime;
        this.lines.push({
            startTime,
            translation: trans,
            spans
        });
        duplicateTime.forEach(t => {
            this.lines.push({
                startTime: t,
                translation: trans,
                spans: spans.map(s => ({
                    ...s,
                    startTime: t - startTime + s.startTime,
                    endTime: t - startTime + s.endTime
                } as Span))
            });
        });
    }
    skipLine() {
        while (!(this.lex.tryExpect(T.lineFeed) || this.lex.tryExpect(T.eof))) this.lex.consume();
        this.lex.consume();
    }
    skipLineFeeds() {
        while (this.lex.tryExpect(T.lineFeed))
            this.lex.consume();
    }
    parseTimestamp(str: string, curTime: number): number {
        var result = null;
        var match = /^((\d+)\:)?(\d+)(\.(\d+))?$/.exec(str);
        if (match) {
            result = 0;
            if (match[2]) result += parseInt(match[2]) * 60;
            if (match[3]) result += parseInt(match[3]);
            if (match[4]) result += parseFloat(match[4]);
            result += this.offset;
        } else if (match = /^b([\d\.]+)?(\/(\d+))?$/.exec(str)) {
            result = 60 / this.bpm;
            if (match[1]) result *= parseInt(match[1]);
            if (match[3]) result /= parseInt(match[3]);
            result += curTime;
        }
        return result;
    }
}

export interface Line {
    startTime?: number;
    endTime?: number;
    spans: Span[];
    translation?: string;
}

export interface Span {
    startTime?: number;
    endTime?: number;
    text: string;
    ruby?: string;
}

export interface Lyrics {
    lines: Line[];
    lang?: string;
    translationLang?: string;
}


var l = new Parser(`

[00:00.00] the first line of lyrics

`);
