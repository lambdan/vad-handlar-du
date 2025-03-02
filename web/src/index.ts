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

  const receipts = [];
  for (const f of files) {
    const buffer = f.file.read();
    const md5 = await md5FromBuffer(buffer);

    let exists = await STATICS.pg.getReceiptSourceFileByMD5(md5);
    if (exists) {
      reply.code(400).send("Receipt already uploaded");
      return;
    }

    logger.log("Inserting new receipt source file");
    const b64: string = buffer.toString("base64");
    await STATICS.pg.insertReceiptSourceFile(receiptType, md5, b64);
    exists = await STATICS.pg.getReceiptSourceFileByMD5(md5);

    if (!exists) {
      reply.code(500).send("Upload failed?");
      return;
    }

    const newReceipt = await Receipt.insertFromSourceFile(exists.id, false);
    receipts.push(newReceipt);
  }

  const receiptLinks = receipts.map(
    (r) => `<a href="/receipt/${r.id}">${r.id}</a><br>`
  );

  reply.type("text/html").send(`Uploaded: <br> ${receiptLinks}`);
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

STATICS.fastify.get<{ Params: { id: string } }>(
  "/receipt/:id/download",
  async (request, reply) => {
    const { id } = request.params;

    const receipt = await STATICS.pg.fetchReceiptByID(id);
    if (!receipt) {
      reply.code(404).send("Receipt not found");
      return;
    }

    const src = await STATICS.pg.getReceiptSourceFileByID(
      receipt.source_file_id
    );

    if (!src) {
      reply.code(404).send("Source file not found");
      return;
    }

    if (src.type === ReceiptSourceFileType.PDF_COOP_V1) {
      reply.type("application/pdf").send(Buffer.from(src.base64, "base64"));
    }

    reply.code(500).send("Unknown source file type");
  }
);

STATICS.fastify.get<{ Params: { id: string } }>(
  "/receipt/:id/reimport",
  async (request, reply) => {
    const { id } = request.params;

    const receipt = await STATICS.pg.fetchReceiptByID(id);
    if (!receipt) {
      reply.code(404).send("Receipt not found");
      return;
    }

    const src = await STATICS.pg.getReceiptSourceFileByID(
      receipt.source_file_id
    );

    if (!src) {
      reply.code(404).send("Source file not found");
      return;
    }

    await Receipt.insertFromSourceFile(src.id, true);

    reply.redirect(`/receipt/${id}`);
  }
);

STATICS.fastify.get<{ Params: { id: string } }>(
  "/receipt/:id/delete",
  async (request, reply) => {
    const { id } = request.params;

    const receipt = await STATICS.pg.fetchReceiptByID(id);
    if (!receipt) {
      reply.code(404).send("Receipt not found");
      return;
    }

    const src = await STATICS.pg.getReceiptSourceFileByID(
      receipt.source_file_id
    );

    await STATICS.pg.deleteReceipt(id);

    if (src) {
      await STATICS.pg.deleteSourceFileByID(src.id);
    }

    reply.redirect(`/receipts`);
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
