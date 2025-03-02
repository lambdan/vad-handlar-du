FROM node:22-slim AS build

WORKDIR /build
COPY package.json package-lock.json tsconfig.json /build/
COPY src /build/src
COPY static /build/static

RUN npm ci
RUN npm run build

FROM node:22-slim AS final
WORKDIR /app
COPY --from=build /build/dist ./dist
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/package.json ./package.json
COPY --from=build /build/static ./static

# Coop python scraper
# This should be done through and just copying python from another image but requirements.txt but blehhhh

COPY pdf_parse_coop_v1.py /app/pdf_parse_coop_v1.py
RUN apt-get update && apt-get install -y python3 python3-pip && \
    pip3 install pypdf==5.3.0 pytz==2025.1 --break-system-packages

CMD [ "node", "dist/index.js" ]