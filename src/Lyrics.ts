// file: Lyrics.ts

export function parse(str: string) {
    return new Parser(str).parse();
}

class LookaheadBuffer<T> {
    buf: T[] = [];
    provider: () => T;
    consume() {
        var item = this.peek(0);
        this.buf.shift();
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

var TAGBEGIN = '['.charCodeAt(0);
var TAGEND = ']'.charCodeAt(0);
var BRACKETBEGIN = '{'.charCodeAt(0);
var BRACKETEND = '}'.charCodeAt(0);
var NOTLINEFEED = '\r'.charCodeAt(0);
var LINEFEED = '\n'.charCodeAt(0);

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
        for (var i = 0; this.buf.peek(i).type !== 'eof'; i++) { }
        return this.buf.buf.map(x => x);
    }
    lastToken: Token;
    read(): Token {
        var token = this.readCore();
        this.lastToken = token;
        return token;
    }
    readCore(): Token {
        var str = this.str;
        var begin = this.cur;
        var cur = this.cur;
        try {
            if (cur == str.length)
                return new Token('eof');
            while (true) {
                var ch = str.charCodeAt(cur);
                cur++;
                if (ch === TAGBEGIN) return new Token('tagBegin', ch);
                if (ch === TAGEND) return new Token('tagEnd', ch);
                if (ch === BRACKETBEGIN) return new Token('bracketBegin', ch);
                if (ch === BRACKETEND) return new Token('bracketEnd', ch);
                if (ch === TAGBEGIN) return new Token('tagBegin', ch);
                if (ch === TAGEND) return new Token('tagEnd', ch);
                if (ch === NOTLINEFEED) continue;
                if (ch === LINEFEED) return new Token('lineFeed', ch);
                do {
                    cur++;
                    ch = str.charCodeAt(cur);
                } while (!(isNaN(ch) || ch === TAGBEGIN || ch === TAGEND
                    || ch === BRACKETBEGIN || ch === BRACKETEND
                    || ch === LINEFEED || ch === NOTLINEFEED));
                return new Token('text', str.substring(begin, cur));
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
        if (!t) this.error(`expected token type '${type}'`);
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

type TokenType = 'tagBegin' | 'tagEnd' | 'bracketBegin' | 'bracketEnd' | 'text' | 'lineFeed' | 'eof';

class Token {
    type: TokenType;
    val: string;
    constructor(type: TokenType, val?: string | number) {
        this.type = type;
        this.val = typeof val == 'number' ? String.fromCharCode(val) : val;
    }
    toString() {
        return `{${this.type}|${this.val}}`;
    }
}

export class Parser {
    lex: Lexer;
    tokens: LookaheadBuffer<Token>;
    lines: Line[] = [];
    constructor(str: string) {
        this.lex = new Lexer(str);
        this.tokens = this.lex.buf;
    }
    parse(): Parsed {
        var lex = this.lex;
        this.skipLineFeeds();
        while (lex.peek().type !== 'eof') {
            this.parseLine();
            this.skipLineFeeds();
        }
        this.lines.sort((a, b) => a.startTime - b.startTime);
        return { lines: this.lines };
    }
    parseLine() {
        var lex = this.lex;
        var startTime: number = null;
        var duplicateTime: number[] = [];
        var spans: Span[] = [];
        var lastSpan: Span = null;
        var curTime: number = null;
        while (true) {
            if (lex.tryExpect('tagBegin')) {
                lex.consume();
                let text = lex.expectAndConsume('text').val;
                let ts = this.parseTimestamp(text);
                if (typeof ts == 'number') {
                    curTime = ts;
                    lex.expectAndConsume('tagEnd');
                    if (!lastSpan) {
                        if (startTime) {
                            duplicateTime.push(ts);
                        } else {
                            startTime = ts;
                        }
                    } else {
                        lastSpan.endTime = ts;
                    }
                } else if (lex.tryExpectSeq(['tagEnd', 'bracketBegin'])) {
                    lex.consume(); lex.consume();
                    let ruby = lex.expectAndConsume('text').val;
                    lex.expectAndConsume('bracketEnd');
                    spans.push(lastSpan = { text, ruby, startTime: curTime, endTime: null });
                } else {
                    if (!lastSpan) {
                        // unknown tag at the beginning of the line, so skip this line.
                        this.skipLine();
                        return;
                    }
                }
            } else if (lex.tryExpect('text')) {
                let text = lex.consume().val;
                spans.push(lastSpan = { text, ruby: null, startTime: curTime, endTime: null });
            } else if (lex.tryExpect('lineFeed')) {
                lex.consume();
                break;
            } else if (lex.tryExpect('eof')) {
                break;
            } else {
                break;
            }
        }
        if (startTime === null && spans.length === 0) return;
        this.lines.push({
            startTime,
            spans
        });
        duplicateTime.forEach(t => {
            this.lines.push({
                startTime: t,
                spans: spans.filter(s => ({
                    ...s,
                    startTime: t - startTime + s.startTime,
                    endTime: t - startTime + s.endTime
                } as Span))
            });
        });
    }
    skipLine() {
        while (!(this.lex.tryExpect('lineFeed') || this.lex.tryExpect('eof'))) this.lex.consume();
        this.lex.consume();
    }
    skipLineFeeds() {
        while (this.lex.tryExpect('lineFeed'))
            this.lex.consume();
    }
    parseTimestamp(str: string): number {
        var match = /^((\d+)\:)?(\d+)(\.(\d+))?$/.exec(str);
        if (!match) return null;
        var result = 0;
        if (match[2]) result += parseInt(match[2]) * 60;
        if (match[3]) result += parseInt(match[3]);
        if (match[4]) result += parseFloat(match[4]);
        return result;
    }
}

export interface Line {
    startTime?: number;
    endTime?: number;
    spans: Span[];
}

export interface Span {
    startTime?: number;
    endTime?: number;
    text: string;
    ruby: string;
}

export interface Parsed {
    lines: Line[];
}


var l = new Parser(`

[00:00.00] the first line of lyrics

`);
