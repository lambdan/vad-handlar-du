import Fastify from "fastify";
import { Postgres } from "./postgres";
import { Logger } from "./logger";
import { www } from "./www";
import { VisitImport } from "./models";

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

STATICS.fastify.get("/import", async (request, reply) => {
  reply
    .type("text/html")
    .send(cacheAndReturn(request.url, await STATICS.web.importPage()));
});

STATICS.fastify.post<{ Body: { json: string } }>(
  "/import",
  async (request, reply) => {
    const { json } = request.body;
    let c: VisitImport[];

    try {
      c = JSON.parse(json);
    } catch (error) {
      reply.code(400).send("Invalid JSON");
      return;
    }

    for (const visit of c) {
      await STATICS.pg.importVisit(visit);
    }
    reply.send("OK, imported " + c.length + " visits");
  }
);

/* Games */

/*
STATICS.fastify.get("/game/:id", async (request, reply) => {
  const cache = getCache(request.url);
  if (cache) {
    return reply.type("text/html").send(cache);
  }
  const { id } = request.params as { id: string };

  reply
    .type("text/html")
    .send(cacheAndReturn(request.url, await STATICS.web.gamePage(+id)));
});

STATICS.fastify.get("/game/:id/chartData", async (request, reply) => {
  const cache = getCache(request.url);
  if (cache) {
    return reply.send(cache);
  }

  const { id } = request.params as { id: number };
  const game = await STATICS.pg.fetchGame(id);
  if (!game) {
    reply.code(400).send("Could not get game");
    return;
  }

  reply.send(cacheAndReturn(request.url, await game.chartData()));
});

STATICS.fastify.get("/games", async (request, reply) => {
  const cache = getCache(request.url);
  if (cache) {
    return reply.type("text/html").send(cache);
  }

  reply
    .type("text/html")
    .send(cacheAndReturn(request.url, await STATICS.web.gamesPage()));
}); 

/* Users */
/*
STATICS.fastify.get("/users", async (request, reply) => {
  const cache = getCache(request.url);
  if (cache) {
    return reply.type("text/html").send(cache);
  }

  reply
    .type("text/html")
    .send(cacheAndReturn(request.url, await STATICS.web.usersPage()));
});

STATICS.fastify.get("/user/:id", async (request, reply) => {
  const cache = getCache(request.url);
  if (cache) {
    return reply.type("text/html").send(cache);
  }
  const { id } = request.params as { id: string };
  const html = await STATICS.web.userPage(id);

  reply.type("text/html").send(cacheAndReturn(request.url, html));
});

STATICS.fastify.get("/user/:id/chartData", async (request, reply) => {
  const cache = getCache(request.url);
  if (cache) {
    return reply.send(cache);
  }
  const { id } = request.params as { id: string };
  const user = await STATICS.pg.fetchUser(id);
  if (!user) {
    reply.code(400).send("Could not get user");
    return;
  }
  reply.send(cacheAndReturn(request.url, await user.chartData()));
});

/* Totals */
/*
STATICS.fastify.get("/totals/chartData", async (request, reply) => {
  const cache = getCache(request.url);
  if (cache) {
    return reply.send(cache);
  }
  reply.send(cacheAndReturn(request.url, await STATICS.totals.chartData()));
});
*/
// end of routes

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
