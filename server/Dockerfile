FROM alpine:3.19
ARG PB_VERSION=0.25.9
ARG TARGETARCH
RUN apk add --no-cache ca-certificates wget unzip \
    && wget -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
    && unzip /tmp/pb.zip -d /usr/local/bin/ && rm /tmp/pb.zip
WORKDIR /app
COPY pb_hooks/ ./pb_hooks/
COPY pb_migrations/ ./pb_migrations/
RUN mkdir -p /app/pb_data/bundles
EXPOSE 8090
CMD ["pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/app/pb_data", "--hooksDir=/app/pb_hooks", "--migrationsDir=/app/pb_migrations"]
