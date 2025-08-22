# ---------- Build stage ----------
  FROM node:20-alpine AS builder
  WORKDIR /app
  RUN apk add --no-cache python3 make g++
  COPY package*.json ./
  RUN npm ci
  COPY . .
  RUN npm run build
  
  # ---------- Runtime stage ----------
  FROM node:20-alpine AS runner
  WORKDIR /app
  ENV NODE_ENV=production
  ENV PORT=3001
  COPY --from=builder /app/package*.json ./
  RUN npm ci --omit=dev
  COPY --from=builder /app/dist ./dist
  EXPOSE 3001
  CMD ["node", "dist/main.js"]
  