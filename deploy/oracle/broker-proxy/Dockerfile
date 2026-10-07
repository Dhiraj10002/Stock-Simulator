FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends privoxy curl ca-certificates && rm -rf /var/lib/apt/lists/*
USER privoxy
EXPOSE 8118
ENTRYPOINT ["privoxy", "--no-daemon", "/etc/privoxy/config"]
