#!/usr/bin/env bash
# Leantime on Docker Compose, Podman and Kubernetes (rt_serve, webship/workspace#841): the web container runs this as
# the host user, from the project's folder, once the project's database takes connections. The site's values go into
# the environment, the folders of the files Leantime keeps beside its database are made in the project, and then the
# image's own start runs: supervisord, with nginx (on 8080), PHP-FPM and Leantime's scheduler. On DDEV Leantime's own
# container starts as its image says, and this is not used.
here="$(cd "$(dirname "$0")" && pwd)"
set -a
# shellcheck disable=SC1091
. "${here}/env" || exit 1
set +a
mkdir -p "${here}/files/userfiles" "${here}/files/public-userfiles" "${here}/files/plugins" || exit 1
exec /start.sh
