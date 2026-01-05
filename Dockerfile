FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src ./src

RUN bun build src/index.ts --compile --outfile=smtp-server

FROM gcr.io/distroless/base-debian12

WORKDIR /app

COPY --from=builder /app/smtp-server /app/smtp-server

EXPOSE 3000

CMD ["/app/smtp-server"]
