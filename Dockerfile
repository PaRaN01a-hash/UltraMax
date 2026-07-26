FROM node:20-alpine

RUN addgroup -S ultramax && adduser -S -G ultramax ultramax \
    && apk add --no-cache su-exec

WORKDIR /app

COPY addon/package*.json ./
RUN npm install --omit=dev

COPY addon/ .
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /data \
    && chown -R ultramax:ultramax /app /data

EXPOSE 7000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "index.js"]
