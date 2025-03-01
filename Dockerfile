FROM node:22-alpine AS build

WORKDIR /build
COPY web/package.json web/package-lock.json web/tsconfig.json /build/
COPY web/src /build/src
COPY web/static /build/static

RUN npm ci
RUN npm run build

FROM node:22-alpine AS final
WORKDIR /app
COPY --from=build /build/dist ./dist
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/package.json ./package.json
COPY --from=build /build/static ./static

CMD [ "node", "dist/index.js" ]