FROM node:20-alpine

# Install GitHub CLI
RUN apk add --no-cache github-cli curl

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy application code
COPY server.js configurations.json ./

# Expose the webhook server port
EXPOSE 3030

# Set default environment variables
ENV PORT=3030

# Start the server
CMD ["node", "server.js"]
