import { setupServer } from 'msw/node';
import { createOpenApiHttp } from 'openapi-msw';
import type { paths } from '../generated/schema';

/** Base URL the in-process mock backend answers on. */
export const MOCK_BASE_URL = 'http://backend.test';

/**
 * Request handlers typed from the generated spec: paths, status codes and bodies that are not
 * in `openapi/OpenAPI.json` fail to compile.
 */
export const http = createOpenApiHttp<paths>({ baseUrl: MOCK_BASE_URL });

/** An in-process mock backend for tests; register handlers per test with `server.use(...)`. */
export const server = setupServer();
