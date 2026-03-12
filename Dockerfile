FROM node:20-alpine
WORKDIR /app
COPY tracker-daemon.js .
ENV PORT=8080
EXPOSE 8080
CMD ["node", "tracker-daemon.js"]
