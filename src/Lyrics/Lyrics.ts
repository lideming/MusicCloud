// file: Lyrics.ts

/**
 * Parse lyrics
 * @param str String to be parsed as lyrics
 * @returns The parsed `Lyrics` object
 */
export function parse(str: string): Lyrics {
  var time = Date.now();
  var r = new Parser(str).parse();
  console.log(
    `[Lyrics] parsed ${str.length} chars in ${Date.now() - time} ms`,
    r
  );
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

const TAGBEGIN = "[".charCodeAt(0);
const TAGEND = "]".charCodeAt(0);
const BRACKETBEGIN = "{".charCodeAt(0);
const BRACKETEND = "}".charCodeAt(0);
const NOTLINEFEED = "\r".charCodeAt(0);
const LINEFEED = "\n".charCodeAt(0);

const mapCharToken = {
  [TAGBEGIN]: T.tagBegin,
  [TAGEND]: T.tagEnd,
  [BRACKETBEGIN]: T.bracketBegin,
  [BRACKETEND]: T.bracketEnd,
  [NOTLINEFEED]: null, // ignored charater
  [LINEFEED]: T.lineFeed,
};

class Lexer {
  buf = new LookaheadBuffer<Token>();
  str: string;
  cur = 0;
  get len() {
    return this.str.length;
  }
  constructor(str: string) {
    this.str = str;
    this.buf.provider = () => {
      return this.read();
    };
  }
  toArray() {
    for (var i = 0; this.buf.peek(i).type !== T.eof; i++) {}
    return this.buf.buf.map((x) => x);
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
      if (cur === str.length) return new Token(T.eof, "[eof]", cur);
      while (true) {
        var ch = str.charCodeAt(cur);
        var chCur = cur++;
        if (!(ch >= 0)) return new Token(T.eof, "[eof]", chCur);
        const tokenType = mapCharToken[ch];
        if (tokenType !== undefined) {
          if (tokenType === null) continue; // ignore charater
          return new Token(tokenType, ch, chCur);
        }
        while (true) {
          ch = str.charCodeAt(cur);
          if (!(ch >= 0) || mapCharToken[ch] !== undefined) break;
          cur++;
        }
        return new Token(T.text, str.substring(begin, cur), begin);
      }
    } finally {
      this.cur = cur;
    }
  }

  peek(pos?: number) {
    return this.buf.peek(pos);
  }
  consume() {
    return this.buf.consume();
  }
  tryExpect(type: TokenType, pos?: number) {
    var t = this.peek(pos);
    if (t.type === type) return t;
    return null;
  }
  tryExpectSeq(types: TokenType[]) {
    var i = 0;
    for (const t of types) {
      if (!this.tryExpect(t, i++)) return false;
    }
    return true;
  }
  expect(type: TokenType) {
    var t = this.tryExpect(type);
    if (!t) this.error(`expected token type '${TokenTypeEnum[type]}'`);
    return t;
  }
  error(msg?: string): never {
    throw new Error((msg ?? "error") + " at " + this.peek());
  }
  tryExpectAndConsume(type: TokenType) {
    return this.tryExpect(type) && this.consume();
  }
  expectAndConsume(type: TokenType) {
    this.expect(type);
    return this.consume();
  }
}

type TokenType = T;

enum TokenTypeEnum {
  ["tagBegin"] = 1,
  ["tagEnd"],
  ["bracketBegin"],
  ["bracketEnd"],
  ["text"],
  ["lineFeed"],
  ["eof"],
}

const enum T {
  ["tagBegin"] = 1,
  ["tagEnd"],
  ["bracketBegin"],
  ["bracketEnd"],
  ["text"],
  ["lineFeed"],
  ["eof"],
}

class Token {
  type: TokenType;
  val: string;
  pos: number;
  constructor(type: TokenType, val: string | number, pos: number) {
    this.type = type;
    this.val = typeof val === "number" ? String.fromCharCode(val) : val;
    this.pos = pos;
  }
  toString() {
    return `{${TokenTypeEnum[this.type]}|${this.val}}`;
  }
}

export class Parser {
  lex: Lexer;
  tokens: LookaheadBuffer<Token>;
  lines: Line[] = [];
  bpm: number | null = null;
  offset = 0;
  curTime: number = 0;
  lang = "";
  tlang = "";
  haveReadLyrics = false;
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
      if (!this.haveReadLyrics) this.skipLineFeeds();
      if (lex.buf.consumed === lastpos) {
        lex.error("parseLine() doesn't consume tokens");
      }
    }
    this.lines.sort((a, b) => {
      return a.orderTime - b.orderTime;
    });
    return {
      lines: this.lines,
      lang: this.lang,
      translationLang: this.tlang,
      bpm: this.bpm,
    };
  }
  parseLine() {
    var lex = this.lex;
    var startTime: number | null = null;
    var duplicateTime: TimeStamp[] = [];
    var spans: Span[] = [];
    var trans: string | null = null;
    var lastSpan: Span | null = null;
    var curTime: number | null = null;
    var timeStamp: TimeStamp | null = null;
    const lineStart = lex.peek().pos;
    while (true) {
      if (lex.tryExpectAndConsume(T.tagBegin)) {
        let text: string | null = null;
        let ts: TimeStamp | null;
        if (lex.tryExpect(T.tagEnd)) {
          ts = { time: -1, beats: null, beatsDiv: null };
        } else if (lex.tryExpect(T.text)) {
          text = lex.expectAndConsume(T.text).val;
          ts = this.parseTimestamp(
            text,
            curTime != null && curTime >= 0 ? curTime : this.curTime ?? 0
          );
        } else {
          this.pushRawLine(startTime, lineStart);
          return;
        }
        if (lex.tryExpectSeq([T.tagEnd, T.bracketBegin])) {
          lex.consume();
          lex.consume();
          let ruby = lex.expectAndConsume(T.text).val;
          lex.expectAndConsume(T.bracketEnd);
          spans.push(
            (lastSpan = {
              text: text || "",
              ruby,
              startTime: curTime,
              timeStamp,
            })
          );
          timeStamp = null;
          continue;
        }
        if (ts != null) {
          lex.expectAndConsume(T.tagEnd);
          if (!lastSpan && startTime != null) {
            duplicateTime.push(ts);
          } else {
            if (timeStamp) {
              spans.push(
                (lastSpan = {
                  text: "",
                  ruby: null,
                  startTime: curTime,
                  timeStamp,
                })
              );
            }
            timeStamp = ts;
            if (ts.time != -1) {
              curTime = ts.time;
              if (startTime === null) startTime = ts.time;
            }
          }
          continue;
        }
        if (text === null) continue;
        if (text.startsWith("bpm:")) {
          this.bpm = parseFloat(text.substr(4));
          lex.expectAndConsume(T.tagEnd);
        } else if (text.startsWith("offset:")) {
          this.offset = parseFloat(text.substr(7)) / 1000;
          lex.expectAndConsume(T.tagEnd);
        } else if (text.startsWith("lang:")) {
          let r = /^([\w\-]+)(\/([\w\-]+))?$/.exec(text.substr(5));
          if (r) {
            this.lang = r[1];
            this.tlang = r[3] || "";
          }
          lex.expectAndConsume(T.tagEnd);
        } else {
          if (!lastSpan) {
            // unknown tag at the beginning of the line, so skip this line.
            this.pushRawLine(startTime, lineStart);
            return;
          } else {
            spans.push(
              (lastSpan = {
                text: "[" + text + "]",
                ruby: null,
                startTime: curTime,
                timeStamp: null,
              })
            );
            if (lex.tryExpect(T.tagEnd)) lex.consume();
          }
        }
      } else if (lex.tryExpect(T.text)) {
        let text = lex.consume().val;
        spans.push(
          (lastSpan = { text, ruby: null, startTime: curTime, timeStamp })
        );
        timeStamp = null;
      } else if (lex.tryExpect(T.lineFeed)) {
        lex.consume();
        if (spans.length > 0 && lex.tryExpect(T.text)) {
          let nextline = lex.peek().val;
          if (nextline.startsWith("/")) {
            trans = nextline.substr(1);
            lex.consume();
            lex.tryExpectAndConsume(T.eof) || lex.expectAndConsume(T.lineFeed);
          }
        }
        break;
      } else if (lex.tryExpect(T.eof)) {
        break;
      } else {
        this.pushRawLine(startTime, lineStart);
        return;
      }
    }
    if (timeStamp) {
      spans.push(
        (lastSpan = { text: "", ruby: null, startTime: curTime, timeStamp })
      );
      timeStamp = null;
    }
    if (spans.length === 0) {
      if (this.haveReadLyrics) {
        spans.push(
          (lastSpan = {
            text: "",
            ruby: null,
            startTime: null,
            timeStamp: null,
          })
        );
      } else {
        return;
      }
    }
    this.haveReadLyrics = true;
    if (curTime != null) this.curTime = curTime;
    this.lines.push({
      startTime,
      orderTime: startTime ?? this.curTime,
      translation: trans,
      spans,
      rawLine: null,
    });
    duplicateTime.forEach((t) => {
      var offset = t.time - startTime!;
      this.lines.push({
        startTime: t.time,
        orderTime: t.time,
        translation: trans,
        spans: spans.map(
          (s) =>
            ({
              text: s.text,
              ruby: s.ruby,
              startTime:
                s.startTime! >= 0 ? s.startTime! + offset : s.startTime,
              timeStamp: !s.timeStamp
                ? null
                : {
                    time:
                      s.timeStamp.time >= 0
                        ? s.timeStamp.time + offset
                        : s.timeStamp.time,
                    beats: s.timeStamp.beats,
                    beatsDiv: s.timeStamp.beatsDiv,
                  },
            } as Span)
        ),
        rawLine: null,
      });
    });
  }
  skipLine() {
    while (!(this.lex.tryExpect(T.lineFeed) || this.lex.tryExpect(T.eof)))
      this.lex.consume();
    this.lex.consume();
  }
  skipLineFeeds() {
    while (this.lex.tryExpect(T.lineFeed)) this.lex.consume();
  }
  pushRawLine(startTime: number | null, start: number) {
    this.skipLine();
    this.lines.push({
      startTime,
      orderTime: startTime ?? this.curTime,
      translation: null,
      spans: null,
      rawLine: this.lex.str.substring(start, this.lex.peek().pos),
    });
  }
  parseTimestamp(str: string, curTime: number | null): TimeStamp | null {
    var match = /^((\d+)\:)?(\d+)(\.(\d+))?$/.exec(str);
    if (!curTime) curTime = 0;
    if (match) {
      // Matched "[MM:SS.ss]" (LRC) or "[SS.ss]" (MusicCloud-extended LRC)
      let result = 0;
      if (match[2]) result += parseInt(match[2]) * 60;
      if (match[3]) result += parseInt(match[3]);
      if (match[4]) result += parseFloat(match[4]);
      result += this.offset;
      if (result < 0) result = 0;
      return { time: result, beats: null, beatsDiv: null };
    } else if ((match = /^b([\d\.]+)?(\/(\d+))?$/.exec(str))) {
      // Matched "[b/BEATS/DIV]" (MusicCloud-extended LRC)
      let result = { time: 60 / this.bpm!, beats: 1, beatsDiv: 1 };
      if (match[1]) {
        // beats
        result.beats = parseFloat(match[1]);
        result.time *= result.beats;
      }
      if (match[3]) {
        // div
        result.beatsDiv = parseInt(match[3]);
        result.time /= result.beatsDiv;
      }
      result.time += curTime;
      return result;
    }
    return null;
  }
}

export interface TimeStamp {
  /** -1: to be filled */
  time: number;

  /** Set with beatsDiv to indicate the beats since last span */
  beats: number | null;
  beatsDiv: number | null;
}

export interface Line {
  /** The time when this line starts */
  startTime: number | null;

  /** Used to sort lines. Usually it's the same as `startTime` except when the `startTime` is null.  */
  orderTime: number;

  /** The spans for this line, have at least one span if the line is parsed. */
  spans: Span[] | null;

  /** The translation for this line */
  translation: string | null;

  /** The unparsed string when the parser failed to parse this line */
  rawLine: string | null;
}

export interface Span {
  startTime: number | null;
  text: string;

  /** Optional ruby text that displayed above the text */
  ruby: string | null;

  /** Detailed time info */
  timeStamp: TimeStamp | null;
}

export interface Lyrics {
  lines: Line[];
  lang?: string;
  translationLang?: string;
  bpm: number | null;
}

/**
 * Serialize lyrics
 * @param lyrics The Lyrics object to be serialized
 * @param extended Whether to generate MusicCloud-extended LRC result
 * @returns Serialized lyrics
 */
export function serialize(lyrics: Lyrics, extended: boolean = false) {
  var str = "";
  var headersPending = extended && (!!lyrics.lang || lyrics.bpm != null);
  lyrics.lines.forEach((l) => {
    // Emit the metadata header
    if (l.spans && headersPending) {
      headersPending = false;
      if (lyrics.lang) {
        str += "[lang:" + lyrics.lang;
        if (lyrics.translationLang) str += "/" + lyrics.translationLang;
        str += "]\n";
      }
      if (lyrics.bpm != null) {
        str += "[bpm:" + lyrics.bpm + "]\n";
      }
      str += "\n";
    }

    // Emit the body
    if (l.rawLine) {
      // Emit unparsed line as-is
      str += l.rawLine;
    } else if (l.spans) {
      // Emit every spans of parsed line
      l.spans.forEach((s) => {
        if (s.timeStamp) {
          if (!extended) {
            const time = s.timeStamp.time;
            if (s.timeStamp.time === -1) {
              // omit
            } else {
              const min = padLeft(Math.floor(time / 60), 2, "0");
              const sec = padLeft((time % 60).toFixed(2), 5, "0");
              str += `[${min}:${sec}]`;
            }
          } else {
            if (s.timeStamp.beats != null) {
              str += "[b";
              if (s.timeStamp.beats != 1) str += s.timeStamp.beats;
              if (s.timeStamp.beatsDiv != 1) str += "/" + s.timeStamp.beatsDiv;
              str += "]";
            } else if (s.timeStamp.time === -1) {
              str += "[]";
            } else {
              str += "[" + s.timeStamp.time.toFixed(3) + "]";
            }
          }
        }
        if (extended && s.ruby != null) {
          str += "[" + s.text + "]{" + s.ruby + "}";
        } else {
          str += s.text;
        }
      });
      if (extended && l.translation) {
        str += "\n/" + l.translation;
      }
      str += "\n";
    }
  });
  return str;
}

function padLeft(val: string | number, length: number, pad: string): string {
  if (typeof val == "number") val = val.toString();
  while (val.length < length) val = pad + val;
  return val;
}
