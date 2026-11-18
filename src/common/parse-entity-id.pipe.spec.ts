import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  ParseEntityIdPipe,
  ParseOptionalEntityIdPipe,
  parseEntityId,
} from './parse-entity-id.pipe';

const NOT_FOUND = {
  statusCode: 404,
  message: 'Not found',
  error: 'Not Found',
};

describe('parseEntityId', () => {
  const pipe = new ParseEntityIdPipe();
  const optional = new ParseOptionalEntityIdPipe();

  // Number() is what the global ValidationPipe already applied, so a numeric
  // string and that number have to agree.
  it.each([
    [0, 0],
    [1, 1],
    [-1, -1],
    [2147483647, 2147483647],
    [-2147483648, -2147483648],
    ['0', 0],
    ['42', 42],
    ['-3', -3],
    ['2147483647', 2147483647],
    ['', 0],
    [' 12', 12],
    ['1e2', 100],
  ] as const)('accepts %p as %p', (value, expected) => {
    expect(parseEntityId(value)).toBe(expected);
    expect(pipe.transform(value)).toBe(expected);
    expect(optional.transform(value)).toBe(expected);
  });

  it.each([
    'all',
    'abc',
    'xyz',
    '1.5',
    '1abc',
    '2147483648',
    '-2147483649',
    '999999999999999999999',
    NaN,
    Infinity,
    1.5,
    2147483648,
    -2147483649,
    1e21,
    null,
    undefined,
    true,
    false,
    {},
    [],
  ])('rejects %p with 404', (value) => {
    expect(parseEntityId(value)).toBeUndefined();
    expect(() => pipe.transform(value)).toThrow(NotFoundException);
    try {
      pipe.transform(value);
    } catch (error) {
      expect((error as NotFoundException).getResponse()).toEqual(NOT_FOUND);
    }
  });

  it('leaves an absent query id absent and rejects a bad one with 400', () => {
    expect(optional.transform(undefined)).toBeUndefined();
    expect(optional.transform(null)).toBeUndefined();

    expect(() => optional.transform('nope')).toThrow(BadRequestException);
    expect(() => optional.transform(NaN)).toThrow(BadRequestException);
    expect(() => optional.transform(2147483648)).toThrow(BadRequestException);
    try {
      optional.transform('nope');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toEqual({
        statusCode: 400,
        message: 'Validation failed (numeric string is expected)',
        error: 'Bad Request',
      });
    }
  });
});
