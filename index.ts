export namespace TJSON {//

type Checker = (Lex:Lex, sample:Record<string,any>, parsed:Record<string,any>)=>void

let check:Checker = (lex:Lex, sample:Record<string,any>, parsed:Record<string,any>) => {
  for (const k in sample) {
    if (typeof(sample[k] !== "function") && !(k in parsed)) {
      throw lex.error("Missing required property: " + k)
    }
  }
}

export const checkWith = (checker:Checker) => {
  check = checker
}

export const beforeParse = Symbol("beforeParse")
export const afterParse = Symbol("afterParse")

export interface Type {
  priority:number,
  isValid(sample:any):boolean
  parse(lex:Lex, sample:any):Promise<any>
}

const types:Type[] = [
  {
    priority: 1_000_000, // boolean
    isValid: (sample:any) => {
      return typeof(sample) === 'boolean'
    },
    parse: async (lex:Lex, sample:any) => {
      return await lex.booleanLiteral()
    }
  },
  {
    priority: 2_000_000, // number
    isValid: (sample:any) => {
      return typeof(sample) === 'number'
    },
    parse: async (lex:Lex, sample:any) => {
      return await lex.numberLiteral()
    }
  },
  {
    priority:10_000_000, // date
    isValid: (sample:any) => { 
      return Object.prototype.toString.call(sample) === '[object Date]'
    },
    parse: async (lex:Lex, sample:any) => {
      const string = await lex.stringLiteral()
      const result = new Date(string)
      if (isNaN(result.getTime())) {
        throw lex.error("Expected date, got " + string + ".")
      }
      return result
    }
  },
  {
    priority:11_000_000, // string
    isValid: (value:any) => { return typeof(value) === 'string' },
    parse: async (lex:Lex, sample:any) => {
      return await lex.stringLiteral()
    }
  },
  {
    priority:12_000_000, // array
    isValid: (value:any) => { return Array.isArray(value) },
    parse: async (lex:Lex, sample:any) => {
      const array = (sample as any[])
      if (array.length === 0) {
        throw lex.error("No sample element in sample array.")
      }
      const sampleElement = (sample as any[])[0]
      const result:any[] = []
      for await (const x of lex.elements(sampleElement)) {
        result.push(x)
      }
      return result
    }
  },
  {
    priority:13_000_000, // object
    isValid: (sample:any) => { return typeof(sample) === 'object' },
    parse: async (lex:Lex, sample:any) => {
      return lex.object(sample)
    }
  },
  {
    priority:2**53-1, // fail on other types
    isValid: (sample:any) => { return true },
    parse: async (lex:Lex, sample:any) => {
      throw new TypeError("Unsupported type")
    }
  }
]

export const addType = (type:Type):void => {
  types.push(type)
  types.sort((a, b) => a.priority - b.priority)
}


const isWhite = (ch:string) => {
  return ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r'
}

const isDigit = (ch:string) => {
  const code = ch.charCodeAt(0)
  return code >= 48 && code <= 57
}

export class Lex {

  private decoder:ReadableStream<string>
  private reader:ReadableStreamDefaultReader<string>
  private chars:string[] = []
  private index = 0
  private eof = false
  private lineNo = 1
  private charNo = 1

  constructor(stream:ReadableStream<Uint8Array>, encoding:string) {
    this.decoder = stream.pipeThrough(new TextDecoderStream(encoding, { fatal:true }))
    this.reader = this.decoder.getReader()
  }

  error = (msg:string) => {
    return new SyntaxError("(Line:" + this.lineNo + ", character:" + this.charNo + "): " + msg)
  }

  peek = async ():Promise<string> => {
    if (this.eof) { return "" }
    if (this.index >= this.chars.length) {
      const { done, value } = await this.reader.read()
      if (done) {
        // TODO close stream...somehow
        this.chars = []
        this.index = 0
        this.eof = true
        return ""
      } else {
        this.chars = [...value]
        this.index = 0
      }
    }
    return this.chars[this.index]!
  }

  nextChar = async ():Promise<string> => {
    const result = await this.peek()
    if (result === "") return ""
    this.index++
    if (result === '\n') {
      this.lineNo++
      this.charNo = 1
    } else {
      this.charNo++
    }
    return result
  }

  mustChar = async () => {
    const result = await this.nextChar()
    if (result === "") {
      throw this.error("Expected a character but got EOF.")
    }
    return result
  }

  expect = async (s:string) => {
    await this.skip()
    for (const expected of s) {
      const ch = await this.nextChar()
      if (ch !== expected) {
        throw this.error("Expected " + s + ", got: " + (ch === "" ? "EOF" : ch))
      }
    }
  }

  skip = async () => {
    for (let ch = await this.peek(); isWhite(ch); ch = await this.peek()) {
      await this.nextChar()
    }
  }

  skipAndPeek = async () => {
    await this.skip()
    return await this.peek()
  }

  skipAndExpect = async (delim:string) => {
    await this.skip()
    const ch = await this.nextChar()
    if (ch !== delim) {
      throw this.error("Expected " + delim + " but got: " + (ch === "" ? "EOF" : ch) + ".")
    }
  }

  private unescape = async () => {
    const ch = await this.mustChar()
    switch (ch) {
      case "\"": return "\""
      case "\\": return "\\"
      case "b": return "\b"
      case "f": return "\f"
      case "n": return "\n"
      case "r": return "\r"
      case "t": return "\t"
      case "u": {
        const hex = await this.mustChar() + await this.mustChar() + await this.mustChar() + await this.mustChar()
        return JSON.parse("\"\\u" + hex + "\"") // ahem
      }
      default: {
        throw this.error("Invalid escaped character.")
      }
    }
  }

  booleanLiteral = async () => {
    const ch = await this.skipAndPeek()
    if (ch === 't') {
      await this.expect("true")
      return true
    } else if (ch === 'f') {
      await this.expect("false")
      return false
    } else {
      throw this.error("Expected true or false, got: " + ch)
    }
  }

  private readDigits = async () => {
    let buf = ""
    for (let ch = await this.peek(); isDigit(ch); ch = await this.peek()) {
      buf += await this.nextChar()
    }
    return buf
  }

  numberLiteral = async () => {
    await this.skip()
    const first = await this.peek()
    let buf = ""
    if (first !== "-" && !isDigit(first)) {
      throw this.error("Expected number, got: " + first)
    }
    if (first === "-") {
      buf += await this.nextChar()
    }
    const digits = await this.readDigits()
    if (digits === "") {
      throw this.error("Expected number.")
    }
    if (digits[0] === "0" && digits.length > 1) {
      throw this.error("Invalid number (leading zeroes.)")
    }
    buf += digits
    if (await this.peek() === ".") {
      buf += await this.nextChar()
      const digits = await this.readDigits()
      if (digits === "") {
        throw this.error("Invalid number (empty fraction.)")
      }
      buf += digits
    }
    const e = await this.peek()
    if (e === "e" || e === "E") {
      buf += await this.nextChar()
      const sign = await this.peek()
      if (sign === "+" || sign === "-") {
        buf += await this.nextChar()
      }
      const digits = await this.readDigits()
      if (digits === "") {
        throw this.error("Invalid number (empty exponent.)")
      }
      buf += digits
    }
    return JSON.parse(buf)
  }

  stringLiteral = async () => {
    await this.skipAndExpect('"')
    let result:string = ""
    for (let ch = await this.nextChar(); ch !== '"'; ch = await this.nextChar()) {
      if (this.eof) {
        throw this.error("Expected \" but got EOF.")
      }
      if (ch == '\\') {
        ch = await this.unescape()
      }
      result += ch
    }
    return result
  }

  object = async <T extends object>(sample:T) => {
    const parser = new ObjectParser(this, sample)
    return await parser.parse()
  }

  async * elements<T>(sample:T):AsyncGenerator<T> {
    const type = types.find(x => x.isValid(sample))!
    await this.skipAndExpect("[")
    for (let ch = await this.skipAndPeek(); ch !== "]"; ch = await this.skipAndPeek()) {
      yield type.parse(this, sample)
      const delim = await this.skipAndPeek()
      if (delim === ',') {
        await this.nextChar()
      } else if (delim !== ']') {
        throw this.error(`Expected , or ] but got: ${delim === "" ? "EOF" : delim}`)
      }
    }
    await this.expect("]")
  }

}

class ObjectParser {

  readonly lex:Lex
  readonly target:Record<string|symbol,any>
  readonly original:Record<string|symbol,any>
  readonly template:Record<string|symbol,any>

  constructor(lex:Lex, template:Record<string|symbol,any>) {
    this.lex = lex
    this.original = template
    if (beforeParse in template) {
      this.template = template[beforeParse]()
    } else {
      this.template = template
    }
    this.target = {}
  }

  private async addProperty(key:string) {
    const { lex, target, template } = this
    if (!(key in template)) {
      throw lex.error("No such property: " + key)
    }
    await lex.skip()
    const sample = template[key]
    const type = types.find(x => x.isValid(sample))!
    this.target[key] = await type.parse(lex, sample)
  }

  parse = async () => {
    const lex = this.lex
    await lex.skipAndExpect("{")
    let ch = await lex.skipAndPeek()
    while (ch === '"') {
      const key = await lex.stringLiteral()
      await lex.skipAndExpect(":")
      await this.addProperty(key)
      ch = await lex.skipAndPeek()
      if (ch === ',') {
        await lex.nextChar()
        ch = await lex.skipAndPeek()
      } else if (ch !== '}') {
        throw lex.error(`Expected , or } but got: ${ch === "" ? "EOF" : ch}`)
      }
    }
    await lex.skipAndExpect("}")
    this.lex.skip()
    let result = afterParse in this.original ? this.original[afterParse](this.target) : this.target
    check(lex, this.original, result)
    return result
  }

}

type Stream = ReadableStream<Uint8Array> | string
interface ToStreamResult {
  stream: ReadableStream<Uint8Array>,
  encoding: string
}

const toStream = (stream:Stream, encoding:string):ToStreamResult => {
  if (typeof(stream) == "object") {
    return { stream:stream, encoding:encoding }
  }
  const bytes = new TextEncoder().encode(stream)
  const s = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    }
  })
  return { stream: s, encoding: "utf-8" }
}

export const parse = async <T>(sample:T, streamParam:ReadableStream<Uint8Array> | string, encodingParam:string = "utf-8"):Promise<T> => {
  let { stream, encoding } = toStream(streamParam, encodingParam)
  const lex = new Lex(stream, encoding)
  const type = types.find(x => x.isValid(sample))!
  const result = await type.parse(lex, sample)
  await lex.skip()
  if (await lex.peek() !== "") {
    throw lex.error("Expected one JSON element, got extra data.")
  }
  return result
}

export async function* elements<T>(elementSample:T, streamParam:ReadableStream<Uint8Array> | string, encodingParam:string = "utf-8"):AsyncGenerator<T> {
  let { stream, encoding } = toStream(streamParam, encodingParam)
  const lex = new Lex(stream, encoding)
  return lex.elements(elementSample)
}


}//