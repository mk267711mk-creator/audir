FROM node:22-slim

# Install system dependencies: Python, FFmpeg, pip
RUN apt-get update && apt-get install -y \
    python3 python3-pip ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip3 install yt-dlp --break-system-packages

# Install openai-whisper (for transcription feature)
RUN pip3 install openai-whisper --break-system-packages

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

RUN mkdir -p data uploads

ENV PORT=3001
ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "--experimental-sqlite", "src/index.js"]
