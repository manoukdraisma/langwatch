import { type NextApiRequest, type NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { beforeAll, describe, expect, test } from "vitest";
import {
  SPAN_INDEX,
  TRACE_INDEX,
  esClient,
  spanIndexId,
  traceIndexId,
} from "../../server/elasticsearch";
import {
  type Trace,
  type ElasticSearchSpan,
  type LLMSpan,
  type RAGSpan,
  type CollectorRESTParams,
} from "../../server/tracer/types";
import handler from "./collector";
import { type Project } from "@prisma/client";
import { DEFAULT_EMBEDDINGS_MODEL } from "../../server/embeddings";
import { getTestProject } from "../../utils/testUtils";

const sampleSpan: LLMSpan = {
  type: "llm",
  name: "sample-span",
  span_id: "span_V1StGXR8_Z5jdHi6B-myB",
  parent_id: null,
  trace_id: "trace_test-trace_J5m9g-0JDMbcJqLK",
  input: {
    type: "chat_messages",
    value: [
      { role: "system", content: "you are a helpful assistant" },
      { role: "user", content: "hello" },
    ],
  },
  outputs: [{ type: "text", value: "world" }],
  error: null,
  timestamps: {
    started_at: 1706623872769,
    finished_at: 1706623872769 + 10,
  },
  vendor: "openai",
  model: "gpt-3.5-turbo",
  params: {},
  metrics: {},
};

describe("Collector API Endpoint", () => {
  // TODO: add project id
  let project: Project | undefined;

  beforeAll(async () => {
    project = await getTestProject("collect");

    await esClient.deleteByQuery({
      index: TRACE_INDEX,
      body: {
        query: {
          match: {
            project_id: project.id,
          },
        },
      },
    });
    await esClient.deleteByQuery({
      index: SPAN_INDEX,
      body: {
        query: {
          match: {
            project_id: project.id,
          },
        },
      },
    });
  });

  test("should insert spans into Elasticsearch", async () => {
    const traceData: CollectorRESTParams = {
      trace_id: sampleSpan.trace_id,
      spans: [sampleSpan],
      metadata: {
        thread_id: "thread_test-thread_1",
        user_id: "user_test-user_1",
        customer_id: "customer_test-customer_1",
        labels: ["test-label-1.0.0"],
      },
    };

    const { req, res }: { req: NextApiRequest; res: NextApiResponse } =
      createMocks({
        method: "POST",
        headers: {
          "X-Auth-Token": project?.apiKey,
        },
        body: traceData,
      });

    await handler(req, res);
    expect(res.statusCode).toBe(200);

    const indexedSpan = await esClient.getSource<ElasticSearchSpan>({
      index: SPAN_INDEX,
      id: spanIndexId({
        spanId: sampleSpan.span_id,
        projectId: project?.id ?? "",
      }),
      routing: traceIndexId({
        traceId: sampleSpan.trace_id,
        projectId: project?.id ?? "",
      }),
    });

    expect(indexedSpan).toMatchObject({
      ...sampleSpan,
      input: {
        type: "chat_messages",
        value: JSON.stringify(sampleSpan.input?.value),
      },
      outputs: [
        {
          type: "text",
          value: '"world"',
        },
      ],
      timestamps: {
        ...sampleSpan.timestamps,
        inserted_at: expect.any(Number),
      },
      project_id: project?.id,
    });

    const indexedTrace = await esClient.getSource<Trace>({
      index: TRACE_INDEX,
      id: traceIndexId({
        traceId: sampleSpan.trace_id,
        projectId: project?.id ?? "",
      }),
    });

    expect(indexedTrace).toEqual({
      trace_id: sampleSpan.trace_id,
      project_id: project?.id,
      metadata: {
        thread_id: "thread_test-thread_1",
        user_id: "user_test-user_1",
        customer_id: "customer_test-customer_1",
        labels: ["test-label-1.0.0"],
      },
      timestamps: {
        started_at: expect.any(Number),
        inserted_at: expect.any(Number),
        updated_at: expect.any(Number),
      },
      input: {
        value: "hello",
        satisfaction_score: expect.any(Number),
        embeddings: {
          embeddings: expect.any(Array),
          model: DEFAULT_EMBEDDINGS_MODEL,
        },
      },
      output: {
        value: "world",
        embeddings: {
          embeddings: expect.any(Array),
          model: DEFAULT_EMBEDDINGS_MODEL,
        },
      },
      metrics: {
        first_token_ms: null,
        total_time_ms: expect.any(Number),
        prompt_tokens: 7,
        completion_tokens: 1,
        total_cost: 0.0000125,
        tokens_estimated: true,
      },
      error: null,
      indexing_md5s: expect.any(Array),
    });
  });

  test("should return 405 for non-POST requests", async () => {
    const { req, res }: { req: NextApiRequest; res: NextApiResponse } =
      createMocks({
        method: "GET",
      });
    await handler(req, res);

    expect(res.statusCode).toBe(405);
  });

  test("should return 401 when X-Auth-Token header is missing", async () => {
    const { req, res }: { req: NextApiRequest; res: NextApiResponse } =
      createMocks({
        method: "POST",
      });
    await handler(req, res);

    expect(res.statusCode).toBe(401);
  });

  test("should return 400 for invalid span format", async () => {
    const invalidSpan = {
      type: "invalidType",
      name: "TestName",
      id: "1234",
    };

    const { req, res }: { req: NextApiRequest; res: NextApiResponse } =
      createMocks({
        method: "POST",
        headers: {
          "X-Auth-Token": project?.apiKey,
        },
        body: {
          spans: [invalidSpan],
        },
      });
    await handler(req, res);

    expect(res.statusCode).toBe(400);
  });

  test("should insert RAGs, extracting the input and output from children spans if not available", async () => {
    const traceId = "trace_test-trace_J5m9g-0JDMbcJqLK2";
    const ragSpan: RAGSpan = {
      type: "rag",
      span_id: "span_V1StGXR8_Z5jdHi6B-myE",
      trace_id: traceId,
      contexts: [
        { document_id: "context-1", content: "France is a country in Europe." },
        {
          document_id: "context-2",
          chunk_id: 1 as any, // check if api allow for numbers
          content: "Paris is the capital of France.",
        },
      ],
      outputs: [],
      timestamps: sampleSpan.timestamps,
    };
    const llmSpan: LLMSpan = {
      ...sampleSpan,
      span_id: "span_V1StGXR8_Z5jdHi6B-myF",
      parent_id: ragSpan.span_id,
      trace_id: traceId,
      input: {
        type: "chat_messages",
        value: [
          { role: "system", content: "you are a helpful assistant" },
          { role: "user", content: "What is the capital of France?" },
        ],
      },
      outputs: [
        {
          type: "chat_messages",
          value: [
            { role: "assistant", content: "The capital of France is Paris." },
          ],
        },
      ],
    };

    const traceData: CollectorRESTParams = {
      trace_id: traceId,
      spans: [llmSpan, ragSpan],
    };

    const { req, res }: { req: NextApiRequest; res: NextApiResponse } =
      createMocks({
        method: "POST",
        headers: {
          "X-Auth-Token": project?.apiKey,
        },
        body: traceData,
      });

    await handler(req, res);
    expect(res.statusCode).toBe(200);

    const indexedRagSpan = await esClient.getSource<ElasticSearchSpan>({
      index: SPAN_INDEX,
      id: spanIndexId({
        spanId: ragSpan.span_id,
        projectId: project?.id ?? "",
      }),
      routing: traceIndexId({
        traceId,
        projectId: project?.id ?? "",
      }),
    });

    expect(indexedRagSpan).toMatchObject({
      input: {
        type: "text",
        value: '"What is the capital of France?"',
      },
      outputs: [
        {
          type: "text",
          value: '"The capital of France is Paris."',
        },
      ],
      contexts: [
        {
          document_id: "context-1",
          content: "France is a country in Europe.",
        },
        {
          document_id: "context-2",
          content: "Paris is the capital of France.",
        },
      ],
      project_id: project?.id,
    });
  });

  test("should insert text-only RAG contexts too for backwards-compatibility", async () => {
    const traceId = "trace_test-trace_J5m9g-0JDMbcJqLK2";
    const ragSpan: RAGSpan = {
      type: "rag",
      span_id: "span_V1StGXR8_Z5jdHi6B-myE",
      trace_id: traceId,
      contexts: [
        "France is a country in Europe.",
        "Paris is the capital of France.",
      ] as any,
      outputs: [],
      timestamps: sampleSpan.timestamps,
    };
    const llmSpan: LLMSpan = {
      ...sampleSpan,
      span_id: "span_V1StGXR8_Z5jdHi6B-myF",
      parent_id: ragSpan.span_id,
      trace_id: traceId,
      input: {
        type: "chat_messages",
        value: [
          { role: "system", content: "you are a helpful assistant" },
          { role: "user", content: "What is the capital of France?" },
        ],
      },
      outputs: [
        {
          type: "chat_messages",
          value: [
            { role: "assistant", content: "The capital of France is Paris." },
          ],
        },
      ],
    };

    const traceData: CollectorRESTParams = {
      trace_id: traceId,
      spans: [llmSpan, ragSpan],
    };

    const { req, res }: { req: NextApiRequest; res: NextApiResponse } =
      createMocks({
        method: "POST",
        headers: {
          "X-Auth-Token": project?.apiKey,
        },
        body: traceData,
      });

    await handler(req, res);
    expect(res.statusCode).toBe(200);

    const indexedRagSpan = await esClient.getSource<ElasticSearchSpan>({
      index: SPAN_INDEX,
      id: spanIndexId({
        spanId: ragSpan.span_id,
        projectId: project?.id ?? "",
      }),
      routing: traceIndexId({
        traceId,
        projectId: project?.id ?? "",
      }),
    });

    expect(indexedRagSpan.contexts).toMatchObject([
      {
        document_id: expect.any(String),
        content: "France is a country in Europe.",
      },
      {
        document_id: expect.any(String),
        content: "Paris is the capital of France.",
      },
    ]);
  });

  test("cleans up PII", async () => {
    const traceData: CollectorRESTParams = {
      trace_id: sampleSpan.trace_id,
      spans: [
        {
          ...sampleSpan,
          input: {
            type: "chat_messages",
            value: [
              { role: "system", content: "you are a helpful assistant" },
              {
                role: "user",
                content:
                  "hey there, my email is foo@bar.com, please check it for me",
              },
            ],
          },
        },
      ],
      metadata: {
        thread_id: "thread_test-thread_1",
        user_id: "user_test-user_1",
        customer_id: "customer_test-customer_1",
        labels: ["test-label-1.0.0"],
      },
    };

    const { req, res }: { req: NextApiRequest; res: NextApiResponse } =
      createMocks({
        method: "POST",
        headers: {
          "X-Auth-Token": project?.apiKey,
        },
        body: traceData,
      });

    await handler(req, res);
    expect(res.statusCode).toBe(200);

    const indexedSpan = await esClient.getSource<ElasticSearchSpan>({
      index: SPAN_INDEX,
      id: spanIndexId({
        spanId: sampleSpan.span_id,
        projectId: project?.id ?? "",
      }),
      routing: traceIndexId({
        traceId: sampleSpan.trace_id,
        projectId: project?.id ?? "",
      }),
    });

    expect(indexedSpan).toMatchObject({
      input: {
        type: "chat_messages",
        value: JSON.stringify([
          { role: "system", content: "you are a helpful assistant" },
          {
            role: "user",
            content:
              "hey there, my email is [REDACTED], please check it for me",
          },
        ]),
      },
    });

    const indexedTrace = await esClient.getSource<Trace>({
      index: TRACE_INDEX,
      id: traceIndexId({
        traceId: sampleSpan.trace_id,
        projectId: project?.id ?? "",
      }),
    });

    expect(indexedTrace).toMatchObject({
      input: {
        value: "hey there, my email is [REDACTED], please check it for me",
        satisfaction_score: expect.any(Number),
        embeddings: {
          embeddings: expect.any(Array),
          model: DEFAULT_EMBEDDINGS_MODEL,
        },
      },
    });
  });
});
