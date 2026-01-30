#!/bin/bash

# Get ngrok authtoken from config
NGROK_CONFIG=$(ngrok config check 2>&1 | grep -o '/.*ngrok.yml')
NGROK_TOKEN=$(grep 'authtoken:' "$NGROK_CONFIG" 2>/dev/null | awk '{print $2}')

if [ -z "$NGROK_TOKEN" ]; then
    echo "Error: ngrok authtoken not found. Run: ngrok config add-authtoken <token>"
    exit 1
fi

# Get GitHub token from gh CLI (stored in keychain on macOS)
GH_TOKEN=$(gh auth token 2>/dev/null)

if [ -z "$GH_TOKEN" ]; then
    echo "Error: GitHub CLI not authenticated. Run: gh auth login"
    exit 1
fi

echo "ngrok authenticated"
echo "GitHub CLI authenticated"

NGROK_AUTHTOKEN="$NGROK_TOKEN" GH_TOKEN="$GH_TOKEN" docker compose up --build -d "$@"
