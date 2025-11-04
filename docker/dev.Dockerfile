FROM node:20-bullseye

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential cmake python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY . .

EXPOSE 5173 3000

CMD ["/bin/bash"]
