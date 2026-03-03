FROM node:20-alpine

# Install ffmpeg (required for video processing)
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY . .

# Build
RUN npm run build

# Create data directories
RUN mkdir -p /app/data/chunks /app/data/frames /app/data/gifs /app/data/hls /app/data/uploads

EXPOSE 4000

CMD ["node", "dist/index.js"]
