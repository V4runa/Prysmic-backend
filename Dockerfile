# 1) Base image
FROM node:18-alpine

# 2) Workdir
WORKDIR /app

# 3) System deps (bcrypt etc.)
RUN apk add --no-cache python3 make g++

# 4) Install deps first for better layer caching
COPY package*.json ./
# use ci for reproducible installs; falls back to install if no lock
RUN npm ci || npm install

# 5) Copy source
COPY . .

# 6) Environment (explicit helps PaaS & humans)
ENV NODE_ENV=development
ENV PORT=3001

# 7) Match Nest dev port
EXPOSE 3001

# 8) Start dev server (ts-node)
CMD ["npm", "run", "start:dev"]
