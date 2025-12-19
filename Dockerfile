#FROM node:22 AS base
FROM python:3.12-slim AS base

RUN apt-get update && apt-get install -y curl 

RUN curl -sL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y nodejs

WORKDIR /build
COPY requirements.txt /build
RUN pip3 install -r requirements.txt --break-system-packages

COPY package.json package-lock.json /build/
RUN npm ci

FROM base AS build

WORKDIR /build
COPY tsconfig.json /build/
COPY src /build/src
COPY static /build/static

RUN npm run build

FROM base AS final
WORKDIR /app
COPY --from=build /build/dist ./dist
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/package.json ./package.json
COPY --from=build /build/static ./static

# Copy in parsers
COPY pdf_parse_coop_v1.py /app/pdf_parse_coop_v1.py
COPY pdf_parse_coop_v2.py /app/pdf_parse_coop_v2.py
COPY pdf_parse_ica_kivra_v1.py /app/pdf_parse_ica_kivra_v1.py

CMD [ "node", "dist/index.js" ]
