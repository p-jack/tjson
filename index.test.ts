/**
 * @jest-environment node
 */
import { TJSON } from "./index"

Object.assign(global, { TextDecoder, TextEncoder })

describe('json', () => {

  const small = {
    id: ""
  }

  const sample = {
    yes: false,
    no: true,
    string: "",
    date: new Date(),
    numbers: {
      number: 0,
      fraction: 0,
      exponent: 0,
      both: 0
    },
    arrays: {
      booleans: [false],
      numbers: [0],
      strings: [""],
      dates: [new Date()],
      objects: [small]
    },
  }

  type Sample = typeof sample

  test('it works', async () => {
    const object = {
      string: "\" \\ \/ \b \f \n \r \t \u1111 Fernando",
      date: new Date("1970-01-01T00:00:00.000Z"),
      yes: true,
      no: false,
      numbers: {
        number: -1234,
        fraction: 0.1234,
        exponent: 1234E+20,
        both: -0.1234e+17
      },
      arrays: {
        booleans: [true, false, true, true, false, false],
        numbers: [11, 22, 33, 44],
        strings: ["111", "222", "333", "444"],
        dates: [
          new Date("1970-01-01T00:00:00.000Z"),
          new Date("1970-01-02T00:00:00.000Z"),
          new Date("1970-01-03T00:00:00.000Z"),
          new Date("1970-01-04T00:00:00.000Z"),
        ],
        objects: [
          { id: "1111" },
          { id: "2222" },
          { id: "3333" },
          { id: "4444" },
        ]
      },
    }
    const json = JSON.stringify(object)
    const result = await TJSON.parse<Sample>(sample, json)
    expect(result).toStrictEqual(object)
  })
})

describe("objects", () => {
  const sample = { s: "" }
  test("skips whitespace", async () => {
    const json = '\n\t    {   "s"    : \r   "v"   }   '
    const result = await TJSON.parse(sample, json)
    expect(result.s).toBe("v")
  })
  test("invalid key", () => {
    const json = '{"p":"v"}'
    expect(async () => { await TJSON.parse(sample, json) })
    .rejects.toThrow("(Line:1, character:6): No such property: p")
  })
  test("missing closing", () =>{
    const json = '{"s":"v"'
    expect(async () => { await TJSON.parse(sample, json) })
    .rejects.toThrow("(Line:1, character:9): Expected , or } but got: EOF")
  })
  test("pair doesn't end with a comma or closing brace", () =>{
    const json = '{"s":"v"x'
    expect(async () => { await TJSON.parse(sample, json) })
    .rejects.toThrow("(Line:1, character:9): Expected , or } but got: x")
  })
  test("missing required properties", () => {
    const json = '{}'
    expect(async () => { await TJSON.parse(sample, json) })
    .rejects.toThrow("(Line:1, character:3): Missing required property: s")
  })
  test("extra data", () => {
    const json = '{"s":"v"} Hi there!'
    expect(async () => { await TJSON.parse(sample, json) })
    .rejects.toThrow("(Line:1, character:11): Expected one JSON element, got extra data.")
  })
  test("missing colon", () => {
    const json = '{"s" "v"}'
    expect(async () => { await TJSON.parse(sample, json) })
    .rejects.toThrow("(Line:1, character:7): Expected : but got: \"")
  })
  test("truncated colon", () => {
    const json = '{"s"'
    expect(async () => { await TJSON.parse(sample, json) })
    .rejects.toThrow("(Line:1, character:5): Expected : but got: EOF")
  })
})

describe("dates", () => {
  const sample = { date: new Date(0) }
  type Sample = typeof sample
  test("invalid date", () => {
    const json = JSON.stringify({ date: "abcd" })
    expect(async () => {
      await TJSON.parse<Sample>(sample, json)
    }).rejects.toThrow("(Line:1, character:15): Expected date, got abcd")
  })
})

describe("strings", () => {
  const sample = { s:"" }
  type Sample = typeof sample
  test("unicode escape", async () => {
    const json = '{"s":"\\u1111"}'
    const result = await TJSON.parse(sample, json)
    expect(result.s).toBe("\u1111")
  })
  test("invalid escape", () => {
    const json = '{"s":"\\0"}'
    expect(async () => { await TJSON.parse(sample, json) })
    .rejects.toThrow("(Line:1, character:9): Invalid escaped character.")
  })
  test("truncated escape", () => {
    const json = '{"s":"\\'
    expect(async () => { await TJSON.parse(sample, json) })
    .rejects.toThrow("(Line:1, character:8): Expected a character but got EOF.")
  })
  test("truncated string", () => {
    const json = '{"s'
    expect(async () => { await TJSON.parse(sample, json) })
    .rejects.toThrow("(Line:1, character:4): Expected \" but got EOF.")
  })
})

describe("booleans", () => {
  const sample = { b:true }
  for (const s of ["t", "tr", "tru", "tRue", "trUe", "truE"]) {
    test(`invalid true: ${s}`, () => {
      const json = `{"b":${s}}`
      expect(async () => { await TJSON.parse(sample, json) })
      .rejects.toThrow("Expected true, got:")
    })
  }
  for (const s of ["f", "fa", "fal", "fals", "fAlse", "faLse", "falSe", "falsE"]) {
    test(`invalid false: ${s}`, () => {
      const json = `{"b":${s}}`
      expect(async () => { await TJSON.parse(sample, json) })
      .rejects.toThrow("Expected false, got:")
    })
  }
  for (const s of ["1", "0", "null", "TRUE", "FALSE", '"true"', '"false"']) {
    test(`invalid boolean: ${s}`, () => {
      const json = `{"b":${s}}`
      expect(async () => { await TJSON.parse(sample, json) })
      .rejects.toThrow("Expected true or false, got:")
    })
  }
  test("truncated boolean", () => {
    const json = '{"b":\ntr'
    expect(async () => { await TJSON.parse(sample, json) })
    .rejects.toThrow("(Line:2, character:3): Expected true, got: EOF")
  })
})

describe("numbers", () => {
  const sample = { n:0 }
  test("non-digits", () => {
    const json = '{"n":\n"0"}'
    expect(async () => { await TJSON.parse(sample, json) })
    .rejects.toThrow("(Line:2, character:1): Expected number, got: \"")
  })
  test("leading plus", () => {
    const json = '{"n":\n+0}'
    expect(async () => { await TJSON.parse(sample, json) })
    .rejects.toThrow("(Line:2, character:1): Expected number, got: +")
  })
  test("only minus", () => {
    const json = '{"n":\n-.}'
    expect(async () => { await TJSON.parse(sample, json) })
    .rejects.toThrow("(Line:2, character:2): Expected number.")
  })
  test("leading zeroes", () => {
    const json = '{"n":\n003}'
    expect(async () => { await TJSON.parse(sample, json) })
    .rejects.toThrow("(Line:2, character:4): Invalid number (leading zeroes.)")
  })
  test("empty fraction", () => {
    const json = '{"n":\n0.}'
    expect(async () => { await TJSON.parse(sample, json) })
    .rejects.toThrow("(Line:2, character:3): Invalid number (empty fraction.)")
  })
  test("empty exponent #1", () => {
    const json = '{"n":\n1e}'
    expect(async () => { await TJSON.parse(sample, json) })
    .rejects.toThrow("(Line:2, character:3): Invalid number (empty exponent.)")
  })
  test("empty exponent #2", () => {
    const json = '{"n":\n1E}'
    expect(async () => { await TJSON.parse(sample, json) })
    .rejects.toThrow("(Line:2, character:3): Invalid number (empty exponent.)")
  })

})

describe("elements", () => {
  test("forgot to add a sample element", () => {
    const sample = {a: []}
    const json = '{"a":\n[1,2,3]}'
    expect(async () => { await TJSON.parse(sample, json) })
    .rejects.toThrow("(Line:2, character:1): No sample element in sample array.")
  })
  const sample = {a:[0]}
  test("truncated array", () => {
    const json = '{"a":\n[1,2\n'
    expect(async () => { await TJSON.parse(sample, json) })
    .rejects.toThrow("(Line:3, character:1): Expected , or ] but got: EOF")
  })
  test("no comma", () => {
    const json = '{"a":[1\n2 3]}'
    expect(async () => { await TJSON.parse(sample, json) })
    .rejects.toThrow("(Line:2, character:1): Expected , or ] but got: 2")
  })
  test("static function", async () => {
    const json = "[11,22,33,44]"
    let i = 11
    for await (const x of await TJSON.parse([0], json)) {
      expect(x).toBe(i)
      i += 11
    }
  })
  test("raw stream", async () => {
    const json = "[11,22,33,44]"
    const bytes = new TextEncoder().encode(json)
    const s = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      }
    })
    let i = 11
    for await (const x of await TJSON.parse([0], s)) {
      expect(x).toBe(i)
      i += 11
    }
  })

})

describe("transforms", () => {
  const sample = { 
    x:0, 
    y:0, 
    [TJSON.beforeParse]: () => { 
      return { a:0, b: 0 }
    },
    [TJSON.afterParse]: (object:{a:number, b:number}) => {
      return { x:object.a, y:object.b }
    }
  }
  test("it works", async () => {
    const json = '{"a":11, "b":22}'
    const result = await TJSON.parse(sample, json)
    expect(result.x).toBe(11)
    expect(result.y).toBe(22)
  })
})

describe("custom types", () => {
  class USD {
    constructor(readonly cents:number) {}
    toString = ():string => { 
      return `${this.cents/100}.${this.cents%100} USD`
    }
  }
  
  const usdType = {
    priority: 500,
    isValid: (sample:any) => {
      return sample instanceof USD
    },
    parse: async (lex:TJSON.Lex, sample:any) => {
      return new USD(await lex.numberLiteral())
    }
  }

  const sample = {
    monies: new USD(0),
  }

  test("it works", async () => {
    TJSON.addType(usdType)
    const json = '{"monies":1000}'
    const result = await TJSON.parse(sample, json)
    expect(result.monies.cents).toBe(1000)
  })
})

test("custom checker", () => {
  TJSON.checkWith((lex:TJSON.Lex, sample:Record<string,any>, object:Record<string,any>) => {
    throw lex.error("CUSTOM ERROR")
  })
  const sample = {
    id: 0,
    name: ""
  }
  expect( async () => { await TJSON.parse(sample, `{"id":100,"name":"Fred"}`) }).rejects.toThrow("CUSTOM ERROR")
})
