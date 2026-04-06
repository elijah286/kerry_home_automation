FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/

RUN npm install --workspaces

COPY shared/ shared/
COPY backend/ backend/

WORKDIR /app/backend
RUN npm run build

EXPOSE 3001 3002
CMD ["node", "dist/index.js"]
