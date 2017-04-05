#!/bin/sh -e

#[ -z "$PAL_SECRETS_YAML" ] && echo "Please set the PAL_SECRETS_YAML environment variable" && exit 1;

DEFAULT_SECRETS='{"dev":{}}'

# Specifies which environment to read from the pal configuration (marathon.yml PAL_SECRETS_YAML)
export APP_ENV="${APP_ENV:-dev}"
export PAL_SECRETS_YAML="${PAL_SECRETS_YAML:-$DEFAULT_SECRETS}"

exec /usr/local/bin/pal -- npm start "$@"
