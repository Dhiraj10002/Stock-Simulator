FROM golang:1.25-alpine AS build

WORKDIR /src

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /server ./cmd/server
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /healthcheck ./cmd/healthcheck

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /sync-instruments ./cmd/sync-instruments

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /profile-db ./cmd/profile-db

FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app
COPY --from=build /server /server
COPY --from=build /healthcheck /healthcheck
COPY --from=build /sync-instruments /sync-instruments
COPY --from=build /profile-db /profile-db

EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/server"]
