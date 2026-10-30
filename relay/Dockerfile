FROM node:22-alpine
WORKDIR /srv
COPY server.mjs ./server.mjs
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node","server.mjs"]
