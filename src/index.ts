import Fastify from "fastify";
import "@fastify/multipart";
import { Postgres } from "./postgres";
import { Logger } from "./logger";
import { www } from "./www";
import { ReceiptSourceFileType } from "./models";
import { md5FromBuffer } from "./utils";
import { Receipt } from "./receipt";
import fs from "fs";

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

const logger = new Logger("Index");

// Routes
STATICS.fastify.get("/", async (request, reply) => {
  return reply.type("text/html").send(await STATICS.web.frontPage());
});

STATICS.fastify.get("/products", async (request, reply) => {
  return reply.type("text/html").send(await STATICS.web.productsPage());
});

STATICS.fastify.get("/receipts", async (request, reply) => {
  return reply.type("text/html").send(await STATICS.web.receiptsPage());
});

STATICS.fastify.get("/import", async (request, reply) => {
  return reply.type("text/html").send(await STATICS.web.importPage());
});

// POST route to get uploaded PDF file in form
STATICS.fastify.post("/upload", async (request, reply) => {
  // Saves files to temp folder, gets deleted when request  is done
  const files = await request.saveRequestFiles();

  // TODO: Do this properly....
  let receiptType = ReceiptSourceFileType.PDF_COOP_V1;
  if (request.url.includes("ica")) {
    receiptType = ReceiptSourceFileType.PDF_ICA_KIVRA_V1;
  }

  const receipts = [];
  for (const f of files) {
    const buffer = await fs.readFileSync(f.filepath);
    const md5 = await md5FromBuffer(buffer);

    let exists = await STATICS.pg.getReceiptSourceFileByMD5(md5);
    if (exists) {
      logger.log("Receipt source file already uploaded");
      continue;
    }

    const b64: string = buffer.toString("base64");
    await STATICS.pg.insertReceiptSourceFile(receiptType, md5, b64);
    exists = await STATICS.pg.getReceiptSourceFileByMD5(md5);

    if (!exists) {
      return reply.code(500).send("Upload failed?");
    }

    const newReceipt = await Receipt.insertFromSourceFile(exists.id, false);
    receipts.push(newReceipt);
  }

  let receiptLinks = "";
  for (const r of receipts) {
    receiptLinks += `<li><a href="/receipt/${r.id}">${r.id}</a></li>`;
  }

  const content = `<h1>OK</h1> <h2>New receipts:</h2> <ul> ${receiptLinks} </ul>`;
  return reply.type("text/html").send(await STATICS.web.genericPage(content));
});

STATICS.fastify.get<{ Params: { id: string } }>(
  "/receipt/:id",
  async (request, reply) => {
    const { id } = request.params;
    return reply.type("text/html").send(await STATICS.web.receiptPage(id));
  }
);

STATICS.fastify.get<{ Params: { id: string } }>(
  "/receipt/:id/json",
  async (request, reply) => {
    const { id } = request.params;

    const receipt = await STATICS.pg.fetchReceiptByID(id);
    const purchases = await STATICS.pg.fetchPurchasesByReceiptID(id);

    return reply.send({ receipt, purchases });
  }
);

STATICS.fastify.get<{ Params: { id: string } }>(
  "/receipt/:id/download",
  async (request, reply) => {
    const { id } = request.params;

    const receipt = await STATICS.pg.fetchReceiptByID(id);
    if (!receipt) {
      return reply.code(404).send("Receipt not found");
    }

    const src = await STATICS.pg.getReceiptSourceFileByID(
      receipt.source_file_id
    );

    if (!src) {
      return reply.code(404).send("Source file not found");
    }

    return reply
      .type("application/pdf")
      .send(Buffer.from(src.base64, "base64"));
  }
);

STATICS.fastify.get<{ Params: { id: string } }>(
  "/receipt/:id/reimport",
  async (request, reply) => {
    const { id } = request.params;

    const receipt = await STATICS.pg.fetchReceiptByID(id);
    if (!receipt) {
      return reply.code(404).send("Receipt not found");
    }

    const src = await STATICS.pg.getReceiptSourceFileByID(
      receipt.source_file_id
    );

    if (!src) {
      return reply.code(404).send("Source file not found");
    }

    await Receipt.insertFromSourceFile(src.id, true);

    return reply.redirect(`/receipt/${id}`);
  }
);

STATICS.fastify.get("/receipts/reimport_all", async (request, reply) => {
  const receipts = await STATICS.pg.fetchReceipts();
  for (const r of receipts) {
    const src = await STATICS.pg.getReceiptSourceFileByID(r.source_file_id);
    if (!src) {
      continue;
    }
    await Receipt.insertFromSourceFile(src.id, true);
  }
  return reply.redirect(`/receipts`);
});

STATICS.fastify.get<{ Params: { id: string } }>(
  "/receipt/:id/delete",
  async (request, reply) => {
    const { id } = request.params;

    const receipt = await STATICS.pg.fetchReceiptByID(id);
    if (!receipt) {
      return reply.code(404).send("Receipt not found");
    }

    const src = await STATICS.pg.getReceiptSourceFileByID(
      receipt.source_file_id
    );

    await STATICS.pg.deleteReceipt(id);

    if (src) {
      await STATICS.pg.deleteSourceFileByID(src.id);
    }

    return reply.redirect(`/receipts`);
  }
);

STATICS.fastify.get<{ Params: { id: string } }>(
  "/product/:id",
  async (request, reply) => {
    const { id } = request.params;
    return reply.type("text/html").send(await STATICS.web.productPage(id));
  }
);

STATICS.fastify.get<{ Params: { id: string } }>(
  "/product/:id/delete",
  async (request, reply) => {
    const { id } = request.params;

    await STATICS.pg.deleteProduct(id);

    return reply.redirect(`/products`);
  }
);

STATICS.fastify.get("/products/delete_empty", async (request, reply) => {
  for (const p of await STATICS.pg.fetchProducts()) {
    if ((await STATICS.pg.fetchPurchasesByProductID(p.id)).length === 0) {
      await STATICS.pg.deleteProduct(p.id);
    }
  }

  return reply.redirect(`/products`);
});

STATICS.fastify.get<{ Params: { id: string; target: string } }>(
  "/product/:id/merge/:target",
  async (request, reply) => {
    const { id, target } = request.params;

    await STATICS.pg.mergeProductIntoOther(id, target);

    return reply.redirect(`/product/${target}`);
  }
);

STATICS.fastify.get<{ Params: { id: string } }>(
  "/product/:id/json",
  async (request, reply) => {
    const { id } = request.params;

    const product = await STATICS.pg.fetchProductByID(id);

    const purchases = await STATICS.pg.fetchPurchasesByProductID(id);

    return reply.send({ product, purchases });
  }
);

STATICS.fastify.get("/reset_all", async (request, reply) => {
  await STATICS.pg.resetAll();

  return reply.redirect(`/`);
});

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
