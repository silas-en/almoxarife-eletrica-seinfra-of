FROM node:20

WORKDIR /app

# copia package
COPY package*.json ./

# 🔥 copia prisma antes do npm install
COPY prisma ./prisma

# instala dependências
RUN npm install --legacy-peer-deps

# copia restante do projeto
COPY . .

# gera prisma client
RUN npx prisma generate

# build
RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm start"]