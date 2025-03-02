import Fastify, { FastifyRequest } from "fastify";
import "@fastify/multipart";
import { Postgres } from "./postgres";
import { Logger } from "./logger";
import { www } from "./www";
import { ReceiptImport, ReceiptSourceFileType } from "./models";
import { MultipartFile } from "@fastify/multipart";
import { md5FromBuffer } from "./utils";
import { Receipt } from "./receipt";

const PROD = process.env.NODE_ENV === "production";

export class STATICS {
  static fastify = Fastify({ logger: true });
  static web = new www();
  static pg = new Postgres({
    host: process.env.POSTGRES_HOST || "localhost",
    port: +(process.env.POSTGRES_PORT || 5432),
    user: process.env.POSTGRES_USER || "groceries",
    password: process.env.POSTGRESS_PASS || "groceries",
    database: process.env.POSTGRES_DB || "groceries",
  });
}

STATICS.fastify.register(require("@fastify/formbody"));
STATICS.fastify.register(require("@fastify/multipart"));

const cacheAge = +(process.env.CACHE_AGE || 60 * 1000);
const cache = new Map<string, any>();
const logger = new Logger("Index");

function getCache(url: string): string | null {
  if (!PROD) {
    // annoying when developing
    return null;
  }
  if (!cache.has(url)) {
    logger.log(url, "is not cached :(");

    return null;
  }
  logger.log(url, "is cached!");
  return cache.get(url);
}

function cacheAndReturn(url: string, data: any): any {
  cache.set(url, data);
  setTimeout(() => {
    cache.delete(url);
    logger.warn(url, "cache expired");
  }, cacheAge);
  return data;
}

// Routes
STATICS.fastify.get("/", async (request, reply) => {
  const cache = getCache(request.url);
  if (cache) {
    return reply.type("text/html").send(cache);
  }

  reply
    .type("text/html")
    .send(cacheAndReturn(request.url, await STATICS.web.frontPage()));
});

STATICS.fastify.get("/products", async (request, reply) => {
  const cache = getCache(request.url);
  if (cache) {
    return reply.type("text/html").send(cache);
  }

  reply
    .type("text/html")
    .send(cacheAndReturn(request.url, await STATICS.web.productsPage()));
});

STATICS.fastify.get("/receipts", async (request, reply) => {
  const cache = getCache(request.url);
  if (cache) {
    return reply.type("text/html").send(cache);
  }

  reply
    .type("text/html")
    .send(cacheAndReturn(request.url, await STATICS.web.receiptsPage()));
});

STATICS.fastify.get("/import", async (request, reply) => {
  reply
    .type("text/html")
    .send(cacheAndReturn(request.url, await STATICS.web.importPage()));
});

/** Route for JSON uploads */
STATICS.fastify.post<{ Body: { json: string; replace: boolean } }>(
  "/import",
  async (request, reply) => {
    const { json, replace } = request.body;
    let c: ReceiptImport[];

    try {
      c = JSON.parse(json);
    } catch (error) {
      reply
        .code(400)
        .type("text/html")
        .send(`JSON parse failed.<br><br>${JSON.stringify(request.body)}`);
      return;
    }

    for (const visit of c) {
      await STATICS.pg.importReceipt(visit, replace);
    }
    reply.type("text/html").send('OK. <br> <a href="/">Go back</a>');
  }
);

// POST route to get uploaded PDF file in form
STATICS.fastify.post("/upload_pdf", async (request, reply) => {
  const parts = request.parts();
  let receiptType: ReceiptSourceFileType | null = null;
  const files: MultipartFile[] = [];
  for await (const part of parts) {
    if (part.type === "file") {
      files.push(part);
    } else if (part.type === "field" && part.fieldname === "receiptType") {
      receiptType = part.value as ReceiptSourceFileType;
    } else {
      logger.error("Unknown part type", part);
    }
  }

  if (!receiptType) {
    reply.code(400).send("No type specified");
    return;
  }

  for (const f of files) {
    const buffer = f.file.read();
    const md5 = await md5FromBuffer(buffer);

    let exists = await STATICS.pg.getReceiptSourceFileByMD5(md5);
    if (!exists) {
      logger.log("Inserting new receipt source file");
      const b64: string = buffer.toString("base64");
      await STATICS.pg.insertReceiptSourceFile(receiptType, md5, b64);
      exists = await STATICS.pg.getReceiptSourceFileByMD5(md5);
    }
    if (!exists) {
      return reply.code(500).send("Failed to upload receipt");
    }

    await Receipt.insertFromSourceFile(exists.id, true);
  }

  reply.type("text/html").send('OK. <br> <a href="/">Go back</a>');
});

STATICS.fastify.get<{ Params: { id: string } }>(
  "/receipt/:id",
  async (request, reply) => {
    const { id } = request.params;

    const receipt = await STATICS.pg.fetchReceiptByID(id);
    if (!receipt) {
      reply.code(404).send("Receipt not found");
      return;
    }

    const cache = getCache(request.url);
    if (cache) {
      return reply.type("text/html").send(cache);
    }

    reply
      .type("text/html")
      .send(cacheAndReturn(request.url, await STATICS.web.receiptPage(id)));
  }
);

STATICS.fastify.listen(
  { port: +(process.env.PORT || 8000), host: "0.0.0.0" },
  (err, address) => {
    if (err) {
      logger.error("Error starting server:", err);

      process.exit(1);
    }
    logger.log(`Server is running at ${address}`);
  }
);
