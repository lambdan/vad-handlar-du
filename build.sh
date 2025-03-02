#!/bin/sh



VERSION=""
PUSH="false"
if [ "$1" = "push" ]; then
  PUSH="true"

  VERSION="$2"

  if [ -z "$VERSION" ]; then
    echo "ERROR: You must provide a version number when pushing"
    echo "./build.sh push <version>"
    exit 1
  fi  
fi

echo "Building..."

docker build -f Dockerfile --tag "vad-handlar-du:latest" --platform linux/amd64,linux/arm64 .
docker tag vad-handlar-du:latest davidsilverlind/vad-handlar-du:latest


if [ "$PUSH" = "true" ]; then
  if ! grep -q "\"version\": \"$VERSION\"" "package.json"; then
    echo "ERROR: Version in package.json does not match argument... did you forget to update package.json?"
    exit 1
  fi

  echo "Pushing $VERSION..."

  docker push davidsilverlind/vad-handlar-du:latest
  docker tag vad-handlar-du:latest "davidsilverlind/vad-handlar-du:$VERSION"
  docker push "davidsilverlind/vad-handlar-du:$VERSION"
fi



