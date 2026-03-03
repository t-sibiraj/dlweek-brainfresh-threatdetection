# ── Stage 1: Build Frontend ─────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ .
RUN npm run build

# ── Stage 2: Build Backend ──────────────────────────────────
FROM node:20-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm install
COPY backend/ .
RUN npm run build

# ── Stage 3: Production ────────────────────────────────────
FROM node:20-alpine

# Install ffmpeg for video processing
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy backend production deps
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm install --omit=dev

# Copy built backend
COPY --from=backend-build /app/backend/dist ./backend/dist

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Create data directories
RUN mkdir -p data/chunks data/frames data/gifs data/hls data/uploads

EXPOSE 4000

WORKDIR /app/backend
CMD ["node", "dist/index.js"]
