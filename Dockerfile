FROM node:20-alpine

WORKDIR /app

COPY addon/package*.json ./
RUN npm install --omit=dev

COPY addon/ .

EXPOSE 7000

CMD ["node", "index.js"]
