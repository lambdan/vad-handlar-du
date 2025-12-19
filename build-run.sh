#!/bin/sh
set -e
docker build -t vad-handlar-du:latest .
docker compose up
