# 1. Use an official Node.js image
FROM node:18-alpine

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Install tools needed to build some npm packages (e.g., bcrypt)
RUN apk add --no-cache python3 make g++

# 4. Copy only the package files (for caching layers)
COPY package*.json ./

# 5. Install dependencies
RUN npm install

# 6. Copy the rest of the source code into the image
COPY . .

# 7. Expose the port your NestJS app runs on
EXPOSE 3000

# 8. Start the app in dev mode with hot reload
CMD ["npm", "run", "start:dev"]
