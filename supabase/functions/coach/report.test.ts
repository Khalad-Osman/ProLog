import { describe, expect, it } from 'vitest'
import {
  buildReportSchema,
  buildUserMessage,
  MAX_INPUT_CHARACTERS,
  parseReport,
  readMessageContent,
  validateRequestBody,
} from './report.ts'

function validBody(overrides: Record<string, unknown> = {}) {
  return { topics: ['summary', 'plateaus'], weeks: 4, input: { periodWeeks: 4 }, ...overrides }
}

function reply(sections: unknown): string {
  return JSON.stringify({ sections })
}

describe('validateRequestBody', () => {
  it('accepts a valid request', () => {
    expect(validateRequestBody(validBody())).toEqual({ ok: true, value: validBody() })
  })

  it.each([
    ['not an object', 'hello'],
    ['no topics', validBody({ topics: [] })],
    ['an unknown topic', validBody({ topics: ['summary', 'write me a poem'] })],
    ['a repeated topic', validBody({ topics: ['summary', 'summary'] })],
    ['an unsupported time range', validBody({ weeks: 52 })],
    ['missing facts', validBody({ input: null })],
    ['facts that are an array', validBody({ input: [] })],
  ])('rejects %s', (_, body) => {
    expect(validateRequestBody(body).ok).toBe(false)
  })

  it('rejects facts too large for one report', () => {
    const input = { notes: 'x'.repeat(MAX_INPUT_CHARACTERS) }

    expect(validateRequestBody(validBody({ input }))).toEqual({
      ok: false,
      error: expect.stringMatching(/fewer exercises/),
    })
  })
})

describe('buildUserMessage', () => {
  it('lists the topics in order, then the facts', () => {
    const message = buildUserMessage(['plateaus', 'summary'], { periodWeeks: 8 })

    expect(message.indexOf('- plateaus:')).toBeLessThan(message.indexOf('- summary:'))
    expect(message).toContain('{"periodWeeks":8}')
  })
})

describe('buildReportSchema', () => {
  it('only lets the model answer with the requested topics', () => {
    const schema = JSON.stringify(buildReportSchema(['summary', 'notes']))

    expect(schema).toContain('"enum":["summary","notes"]')
  })
})

describe('readMessageContent', () => {
  it('returns the first choice message text', () => {
    const payload = { choices: [{ message: { role: 'assistant', content: '{"sections":[]}' } }] }

    expect(readMessageContent(payload)).toBe('{"sections":[]}')
  })

  it.each([
    ['an empty object', {}],
    ['no choices', { choices: [] }],
    ['a refusal with no content', { choices: [{ message: { content: null, refusal: 'No.' } }] }],
  ])('returns null for %s', (_, payload) => {
    expect(readMessageContent(payload)).toBeNull()
  })
})

describe('parseReport', () => {
  it('returns titled sections in the requested order, whatever order the model used', () => {
    const content = reply([
      { topic: 'plateaus', body: 'Squat has stalled.' },
      { topic: 'summary', body: '  Good month.  ' },
    ])

    expect(parseReport(content, ['summary', 'plateaus'])).toEqual([
      { title: 'Overall summary', body: 'Good month.' },
      { title: 'Plateaus', body: 'Squat has stalled.' },
    ])
  })

  it.each([
    ['text that is not JSON', 'Here is your report!'],
    ['a requested topic left out', reply([{ topic: 'summary', body: 'Good month.' }])],
    [
      'a topic that was not requested',
      reply([
        { topic: 'summary', body: 'Good month.' },
        { topic: 'plateaus', body: 'None.' },
        { topic: 'notes', body: 'Extra.' },
      ]),
    ],
    [
      'a repeated topic',
      reply([
        { topic: 'summary', body: 'Good month.' },
        { topic: 'summary', body: 'Again.' },
      ]),
    ],
    [
      'an empty body',
      reply([
        { topic: 'summary', body: '   ' },
        { topic: 'plateaus', body: 'None.' },
      ]),
    ],
    [
      'a body far longer than asked for',
      reply([
        { topic: 'summary', body: 'x'.repeat(5_000) },
        { topic: 'plateaus', body: 'None.' },
      ]),
    ],
  ])('rejects %s', (_, content) => {
    expect(parseReport(content, ['summary', 'plateaus'])).toBeNull()
  })
})
