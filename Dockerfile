FROM node:18-alpine

WORKDIR /app

# Instalar dependencias para compilar sqlite3
RUN apk add --no-cache python3 make g++ cairo-dev jpeg-dev pango-dev giflib-dev pixman-dev

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias (incluyendo sqlite3)
RUN npm install --omit=dev

# Copiar TODO el código fuente
COPY . .

# Crear directorio para la base de datos
RUN mkdir -p /app/data

# Asegurar que los archivos públicos existen
RUN ls -la /app/public/

EXPOSE 3000

# Usar volumen para persistencia de la BD
VOLUME ["/app/data"]

CMD ["npm", "start"]
