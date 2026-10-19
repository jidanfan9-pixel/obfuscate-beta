FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY backend ./backend
COPY frontend ./frontend
EXPOSE 3000
CMD ["node", "backend/server.mjs"]
