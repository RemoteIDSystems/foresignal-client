import type { components, operations, paths } from './generated/schema';
import { http } from './testing/mock-server';

/**
 * Compile-time checks on the generated schema. They run under `npm run typecheck`; at test
 * time they only confirm the module graph loads.
 */
describe('generated schema', () => {
  it('describes the smoke operations', () => {
    expectTypeOf<paths['/v1/system']['get']>().toEqualTypeOf<operations['getSystem']>();
    expectTypeOf<paths['/v1/contract']['get']>().toEqualTypeOf<operations['getContract']>();
    expectTypeOf<
      operations['getSystem']['responses'][200]['content']['application/json']
    >().toEqualTypeOf<components['schemas']['SystemInfo']>();
  });

  it('types the Problem fields the client maps', () => {
    expectTypeOf<components['schemas']['Problem']['title']>().toEqualTypeOf<string>();
    expectTypeOf<components['schemas']['Problem']['status']>().toEqualTypeOf<number>();
  });

  it('rejects mock handlers for paths the spec does not define', () => {
    // @ts-expect-error — not a path in openapi/OpenAPI.json
    const handler = () => http.get('/v1/not-in-the-spec', () => undefined);
    expect(handler).toBeTypeOf('function');
  });
});
