import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

import { SavedSpan, traceFile } from './constants'

createNextDescribe(
  'opentelemetry',
  {
    files: __dirname,
    skipDeployment: true,
    dependencies: {
      'fs-extra': '^8.0.0',
      '@types/fs-extra': '^8.0.0',
      '@opentelemetry/api': '^1.0.0',
      '@opentelemetry/core': '^1.0.0',
      '@opentelemetry/resources': '^1.0.0',
      '@opentelemetry/sdk-trace-base': '^1.0.0',
      '@opentelemetry/sdk-trace-node': '^1.0.0',
      '@opentelemetry/semantic-conventions': '^1.0.0',
      '@opentelemetry/exporter-trace-otlp-http': '^0.34.0',
    },
  },
  ({ next }) => {
    const getTraces = async (): Promise<SavedSpan[]> => {
      const traces = await next.readFile(traceFile)
      return traces
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    }

    /** There were issues where OTEL might not be initialized for first few requests (this is a bug).
     * It made our tests, flaky. This should make tests deterministic.
     */
    const waitForOtelToInitialize = async () => {
      await check(
        async () =>
          await next
            .readFile(traceFile)
            .then(() => 'ok')
            .catch(() => 'err'),
        'ok'
      )
    }

    const waitForRootSpan = async (numberOfRootTraces: number) => {
      await check(async () => {
        const spans = await getTraces()
        const rootSpans = spans.filter((span) => !span.parentId)
        return String(rootSpans.length)
      }, String(numberOfRootTraces))
    }

    /**
     * Sanitize (modifies) span to make it ready for snapshot testing.
     */
    const sanitizeSpan = (span: SavedSpan) => {
      delete span.duration
      delete span.id
      delete span.links
      delete span.events
      delete span.timestamp
      delete span.traceId
      span.parentId = span.parentId === undefined ? undefined : '[parent-id]'
      return span
    }
    const sanitizeSpans = (spans: SavedSpan[]) =>
      spans
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
        .map(sanitizeSpan)

    const getSanitizedTraces = async (numberOfRootTraces: number) => {
      await waitForRootSpan(numberOfRootTraces)
      return sanitizeSpans(await getTraces())
    }

    const cleanTraces = async () => {
      await next.patchFile(traceFile, '')
    }

    beforeAll(async () => {
      await waitForOtelToInitialize()
    })

    afterEach(async () => {
      await cleanTraces()
    })

    it('should have spans when accessing page', async () => {
      await next.fetch('/pages')

      expect(await getSanitizedTraces(1)).toMatchInlineSnapshot(`
        Array [
          Object {
            "attributes": Object {
              "http.method": "GET",
              "http.status_code": 200,
              "http.target": "/pages",
              "next.span_name": "GET /pages",
              "next.span_type": "BaseServer.handleRequest",
            },
            "kind": 1,
            "name": "GET /pages",
            "parentId": undefined,
            "status": Object {
              "code": 0,
            },
          },
          Object {
            "attributes": Object {
              "next.pathname": "/pages",
              "next.span_name": "rendering page",
              "next.span_type": "BaseServer.renderToResponse",
            },
            "kind": 0,
            "name": "rendering page",
            "parentId": "[parent-id]",
            "status": Object {
              "code": 0,
            },
          },
          Object {
            "attributes": Object {
              "next.route": "/pages",
              "next.span_name": "resolving page into components",
              "next.span_type": "NextNodeServer.findPageComponents",
            },
            "kind": 0,
            "name": "resolving page into components",
            "parentId": "[parent-id]",
            "status": Object {
              "code": 0,
            },
          },
        ]
      `)
    })

    it('should handle route params', async () => {
      await next.fetch('/pages/params/stuff')

      expect(await getSanitizedTraces(1)).toMatchInlineSnapshot(`
        Array [
          Object {
            "attributes": Object {
              "http.method": "GET",
              "http.status_code": 200,
              "http.target": "/pages/params/stuff",
              "next.span_name": "GET /pages/params/stuff",
              "next.span_type": "BaseServer.handleRequest",
            },
            "kind": 1,
            "name": "GET /pages/params/stuff",
            "parentId": undefined,
            "status": Object {
              "code": 0,
            },
          },
          Object {
            "attributes": Object {
              "next.pathname": "/pages/params/stuff",
              "next.span_name": "rendering page",
              "next.span_type": "BaseServer.renderToResponse",
            },
            "kind": 0,
            "name": "rendering page",
            "parentId": "[parent-id]",
            "status": Object {
              "code": 0,
            },
          },
          Object {
            "attributes": Object {
              "next.route": "/pages/params/[param]",
              "next.span_name": "resolving page into components",
              "next.span_type": "NextNodeServer.findPageComponents",
            },
            "kind": 0,
            "name": "resolving page into components",
            "parentId": "[parent-id]",
            "status": Object {
              "code": 0,
            },
          },
        ]
      `)
    })

    it('should handle RSC with fetch', async () => {
      await next.fetch('/app/rsc-fetch')

      expect(await getSanitizedTraces(1)).toMatchInlineSnapshot(`
        Array [
          Object {
            "attributes": Object {
              "http.method": "GET",
              "http.url": "https://vercel.com/",
              "net.peer.name": "vercel.com",
              "next.span_name": "fetch GET https://vercel.com/",
              "next.span_type": "AppRender.fetch",
            },
            "kind": 2,
            "name": "fetch GET https://vercel.com/",
            "parentId": "[parent-id]",
            "status": Object {
              "code": 0,
            },
          },
          Object {
            "attributes": Object {
              "http.method": "GET",
              "http.status_code": 200,
              "http.target": "/app/rsc-fetch",
              "next.span_name": "GET /app/rsc-fetch",
              "next.span_type": "BaseServer.handleRequest",
            },
            "kind": 1,
            "name": "GET /app/rsc-fetch",
            "parentId": undefined,
            "status": Object {
              "code": 0,
            },
          },
          Object {
            "attributes": Object {
              "next.pathname": "/app/rsc-fetch",
              "next.span_name": "rendering page",
              "next.span_type": "BaseServer.renderToResponse",
            },
            "kind": 0,
            "name": "rendering page",
            "parentId": "[parent-id]",
            "status": Object {
              "code": 0,
            },
          },
          Object {
            "attributes": Object {
              "next.route": "/app/rsc-fetch/page",
              "next.span_name": "resolving page into components",
              "next.span_type": "NextNodeServer.findPageComponents",
            },
            "kind": 0,
            "name": "resolving page into components",
            "parentId": "[parent-id]",
            "status": Object {
              "code": 0,
            },
          },
        ]
      `)
    })

    it('should handle getServerSideProps', async () => {
      await next.fetch('/pages/getServerSideProps')

      expect(await getSanitizedTraces(1)).toMatchInlineSnapshot(`
        Array [
          Object {
            "attributes": Object {
              "http.method": "GET",
              "http.status_code": 200,
              "http.target": "/pages/getServerSideProps",
              "next.span_name": "GET /pages/getServerSideProps",
              "next.span_type": "BaseServer.handleRequest",
            },
            "kind": 1,
            "name": "GET /pages/getServerSideProps",
            "parentId": undefined,
            "status": Object {
              "code": 0,
            },
          },
          Object {
            "attributes": Object {
              "next.span_name": "getServerSideProps /pages/getServerSideProps",
              "next.span_type": "Render.getServerSideProps",
            },
            "kind": 0,
            "name": "getServerSideProps /pages/getServerSideProps",
            "parentId": "[parent-id]",
            "status": Object {
              "code": 0,
            },
          },
          Object {
            "attributes": Object {
              "next.pathname": "/pages/getServerSideProps",
              "next.span_name": "rendering page",
              "next.span_type": "BaseServer.renderToResponse",
            },
            "kind": 0,
            "name": "rendering page",
            "parentId": "[parent-id]",
            "status": Object {
              "code": 0,
            },
          },
          Object {
            "attributes": Object {
              "next.route": "/pages/getServerSideProps",
              "next.span_name": "resolving page into components",
              "next.span_type": "NextNodeServer.findPageComponents",
            },
            "kind": 0,
            "name": "resolving page into components",
            "parentId": "[parent-id]",
            "status": Object {
              "code": 0,
            },
          },
        ]
      `)
    })

    it('should handle route handlers in app router', async () => {
      await next.fetch('/api/pages/basic')

      expect(await getSanitizedTraces(1)).toMatchInlineSnapshot(`
        Array [
          Object {
            "attributes": Object {
              "http.method": "GET",
              "http.status_code": 200,
              "http.target": "/api/pages/basic",
              "next.span_name": "GET /api/pages/basic",
              "next.span_type": "BaseServer.handleRequest",
            },
            "kind": 1,
            "name": "GET /api/pages/basic",
            "parentId": undefined,
            "status": Object {
              "code": 0,
            },
          },
        ]
      `)
    })
  }
)
