#!/bin/sh
set -e

# The named volume mounted at /data is created (and owned) by the Docker
# daemon as root before this container's first boot, so it can't be chowned
# in the image itself — do it here, as root, before dropping to the
# unprivileged user.
chown -R ultramax:ultramax /data

exec su-exec ultramax "$@"
