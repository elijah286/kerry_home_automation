FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY proxy/package.json proxy/

RUN npm ci --workspace=shared --workspace=proxy

COPY shared/ shared/
COPY proxy/ proxy/

WORKDIR /app/proxy
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/index.js"]
