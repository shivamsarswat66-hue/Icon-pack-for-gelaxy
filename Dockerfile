FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY src ./src
COPY data ./data
COPY public ./public
RUN rm -f data/store.json
ENV PORT=4173 HOST=0.0.0.0
EXPOSE 4173
CMD ["node", "server.js"]
