#!/bin/bash
set -e

echo "Starting server (DB auto-initializes on first run)..."
cd /root/projects/capgo/server
node -e "require('./db'); console.log('Database initialized successfully.');"
