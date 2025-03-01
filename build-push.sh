#!/bin/sh

if [ -z "$1" ]; then
  echo "Usage: $0 version"
  exit 1
fi

echo "Building and pushing version $1 ..."

# check that $1 is same as version in package.json
if ! grep -q "\"version\": \"$1\"" "web/package.json"; then
  echo "ERROR: Version in package.json does not match argument... did you forget to update package.json?"
  exit 1
fi

docker build -f Dockerfile --tag "vad-handlar-du:latest" --platform linux/amd64,linux/arm64 .
docker tag vad-handlar-du:latest davidsilverlind/vad-handlar-du:latest

# Push latest
docker push davidsilverlind/vad-handlar-du:latest

# Push version
docker tag vad-handlar-du:latest "davidsilverlind/vad-handlar-du:$1"
docker push "davidsilverlind/vad-handlar-du:$1"
