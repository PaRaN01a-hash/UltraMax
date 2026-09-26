FROM node:20-alpine

RUN addgroup -S ultramax && adduser -S -G ultramax ultramax \
    && apk add --no-cache su-exec

WORKDIR /app

ENV ULTRAMAX_WEB_ROOT=/app/web \
    IMAGES_DIR=/app/web/images \
    ULTRAMAX_ARTWORK_ROOT=/app/web/images \
    DATA_DIR=/data \
    PROFILE_STORE_ENABLED=false \
    ULTRAMAX_LIVE_SPORTS_ENABLED=false

COPY addon/package*.json ./
RUN npm install --omit=dev

COPY addon/ .
COPY web/ /app/web/
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /data \
    && chown -R ultramax:ultramax /app /data

EXPOSE 7000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "index.js"]
