FROM node:22-alpine AS build

WORKDIR /build
COPY package.json package-lock.json tsconfig.json /build/
COPY src /build/src
COPY static /build/static

RUN npm ci
RUN npm run build

FROM node:22-alpine AS final
WORKDIR /app
COPY --from=build /build/dist ./dist
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/package.json ./package.json
COPY --from=build /build/static ./static

CMD [ "node", "dist/index.js" ]