# ---- Etapa de build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Etapa de producción ----
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY data ./data

# Usuario sin privilegios
RUN addgroup -S doomy && adduser -S doomy -G doomy && \
    chown -R doomy:doomy /app
USER doomy

EXPOSE 3000
CMD ["node", "dist/index.js"]
