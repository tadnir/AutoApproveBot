# AutoApproveBot

A GitHub PR auto-approval bot that approves PRs when you're mentioned in a comment with a trigger word and any emoji.

## Prerequisites

- Docker and Docker Compose
- GitHub CLI (`gh`)
- ngrok account

## Setup

### 1. Install and authenticate GitHub CLI

```bash
# Install (macOS)
brew install gh

# Authenticate
gh auth login
```

Follow the prompts to authenticate with your GitHub account.

### 2. Install and authenticate ngrok

```bash
# Install (macOS)
brew install ngrok

# Sign up at https://dashboard.ngrok.com/signup
# Get your authtoken at https://dashboard.ngrok.com/get-started/your-authtoken

# Add your authtoken
ngrok config add-authtoken <your-authtoken>
```

### 3. Configure GitHub Webhook

After starting the bot, you'll need to add a webhook to each repository you want to monitor:

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Webhooks** → **Add webhook**
3. Configure:
   - **Payload URL**: `https://<ngrok-url>/webhook` (get this from http://localhost:4040 after starting)
   - **Content type**: `application/json`
   - **Secret**: leave empty
   - **Events**: Select "Let me select individual events" → check only **"Issue comments"**
4. Click **Add webhook**

## Running

```bash
./run.sh
```

The bot runs in the background. View the ngrok URL at http://localhost:4040.

### View logs

```bash
docker compose logs -f
```

### Stop

```bash
docker compose down
```

## How It Works

The bot auto-approves a PR when a comment:
1. Mentions your GitHub username (e.g., `@username`)
2. Contains a trigger word (configurable in `triggers.json`)
3. Contains any emoji

**Example comment that triggers approval:**
```
@username please review this PR! 🙏
```

## Configuration

### Trigger Words

Edit `triggers.json` to customize which words trigger auto-approval:

```json
{
  "triggerWords": [
    "review",
    "approve",
    ...
    "check",
    "look"
  ]
}
```

### Approval Comments

Edit `comments.json` to customize the random approval messages.
