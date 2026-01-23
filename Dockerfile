FROM node:18-alpine

WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm install --omit=dev

# Copiar TODO el código fuente
COPY . .

EXPOSE 3000

CMD ["npm", "start"]
