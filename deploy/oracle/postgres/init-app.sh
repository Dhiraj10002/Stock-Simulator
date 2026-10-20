#!/bin/sh
set -eu
# psql reads the password from its environment, never from argv or a log line.
psql --username postgres --dbname postgres --set ON_ERROR_STOP=1 <<'SQL'
\getenv app_password STOCKSIM_APP_PASSWORD
CREATE ROLE stocksim LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
SQL
