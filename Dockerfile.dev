# Use full Node image for dev (includes build tools)
FROM node:20-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3001

# Dev mode: uses ts-node
CMD ["npm", "run", "start:dev"]
