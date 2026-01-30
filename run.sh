#!/bin/bash

# Slack webhook URL parameter (optional)
SLACK_WEBHOOK_URL="$1"
if [ -z "$SLACK_WEBHOOK_URL" ]; then
    echo "Warning: No Slack webhook URL provided. Slack notifications will be disabled."
    echo "Usage: ./run.sh [slack-webhook-url]"
fi

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

NGROK_AUTHTOKEN="$NGROK_TOKEN" GH_TOKEN="$GH_TOKEN" SLACK_WEBHOOK_URL="$SLACK_WEBHOOK_URL" docker compose up --build -d
