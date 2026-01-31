const express = require('express');
const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();

// Load configuration from JSON file
const configPath = path.join(__dirname, 'configurations.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const approvalComments = config.comments;
const triggerWords = config.triggerWords;
const quickTriggerWords = config.quickTriggerWords;
const delayConfig = config.delay;
const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;

function getRandomComment() {
  const index = Math.floor(Math.random() * approvalComments.length);
  return approvalComments[index];
}

function getRandomDelay() {
  const min = delayConfig.minSeconds;
  const max = delayConfig.maxSeconds;
  return Math.floor(Math.random() * (max - min + 1) + min);
}
const PORT = process.env.PORT || 3030;

// Get GitHub username from gh CLI
function getGitHubUsername() {
  try {
    return execSync('gh api user --jq .login', { encoding: 'utf-8' }).trim();
  } catch (error) {
    console.error('Failed to get GitHub username from gh CLI:', error.message);
    process.exit(1);
  }
}

const GITHUB_USERNAME = getGitHubUsername();

app.use(express.json());

// Emoji regex pattern - matches most common emojis
const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2300}-\u{23FF}]|[\u{2B50}]|[\u{2934}-\u{2935}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2600}-\u{2B55}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FAFF}]/u;

function containsEmoji(text) {
  return emojiRegex.test(text);
}

function containsTriggerWord(text) {
  return triggerWords.some(word => {
    const pattern = new RegExp(`\\b${word}\\b`, 'i');
    return pattern.test(text);
  });
}

function containsQuickTriggerWord(text) {
  return quickTriggerWords.some(word => {
    const pattern = new RegExp(`\\b${word}\\b`, 'i');
    return pattern.test(text);
  });
}

function containsMention(text, username) {
  const mentionPattern = new RegExp(`@${username}\\b`, 'i');
  return mentionPattern.test(text);
}

function sendSlackMessage({ repoFullName, prNumber, success, reason, triggeredBy, approver, isQuickTrigger }) {
  if (!slackWebhookUrl) {
    console.log('Slack notification skipped (no webhook URL configured)');
    return;
  }

  const prUrl = `https://github.com/${repoFullName}/pull/${prNumber}`;
  const timestamp = new Date().toISOString();
  const quickTriggerText = isQuickTrigger ? 'Yes' : 'No';

  let text;
  if (success) {
    text = [
      `✅ *Approved PR #${prNumber}* in \`${repoFullName}\``,
      `• PR: <${prUrl}|${repoFullName}#${prNumber}>`,
      `• Triggered by: ${triggeredBy}`,
      `• Approver: ${approver}`,
      `• Quick trigger: ${quickTriggerText}`,
      `• Time: ${timestamp}`
    ].join('\n');
  } else {
    text = [
      `❌ *Failed to approve PR #${prNumber}* in \`${repoFullName}\``,
      `• PR: <${prUrl}|${repoFullName}#${prNumber}>`,
      `• Triggered by: ${triggeredBy}`,
      `• Approver: ${approver}`,
      `• Quick trigger: ${quickTriggerText}`,
      `• Time: ${timestamp}`,
      `• Reason: ${reason}`
    ].join('\n');
  }

  const message = { text };

  const url = new URL(slackWebhookUrl);
  const options = {
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('Slack notification sent successfully');
      } else {
        console.error(`Slack notification failed with status: ${res.statusCode}, reason: ${body}`);
      }
    });
  });

  req.on('error', (error) => {
    console.error('Failed to send Slack notification:', error.message);
  });

  req.write(JSON.stringify(message));
  req.end();
}

function approvePR(repoFullName, prNumber) {
  try {
    const comment = getRandomComment();
    const command = `gh pr review ${prNumber} --repo ${repoFullName} --approve --body "${comment}"`;
    console.log(`Executing: ${command}`);
    const result = execSync(command, { encoding: 'utf-8' });
    console.log(`PR #${prNumber} approved successfully with comment: "${comment}"`);
    return { success: true };
  } catch (error) {
    console.error(`Failed to approve PR #${prNumber}:`, error.message);
    return { success: false, reason: error.message };
  }
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'AutoApproveBot is running', username: GITHUB_USERNAME });
});

// Webhook endpoint
app.post('/webhook', (req, res) => {
  const event = req.headers['x-github-event'];
  const payload = req.body;

  console.log(`\n--- Received event: ${event} ---`);

  // We only care about issue_comment events (PR comments are also issue_comment events)
  if (event !== 'issue_comment') {
    console.log(`Ignoring event type: ${event}`);
    return res.status(200).json({ message: 'Event ignored' });
  }

  // Check if this is a comment on a PR (not just an issue)
  if (!payload.issue?.pull_request) {
    console.log('Comment is not on a PR, ignoring');
    return res.status(200).json({ message: 'Not a PR comment' });
  }

  // Only process newly created comments
  if (payload.action !== 'created') {
    console.log(`Ignoring action: ${payload.action}`);
    return res.status(200).json({ message: 'Action ignored' });
  }

  const comment = payload.comment?.body || '';
  const repoFullName = payload.repository?.full_name;
  const prNumber = payload.issue?.number;
  const commenter = payload.comment?.user?.login;

  console.log(`Repository: ${repoFullName}`);
  console.log(`PR #${prNumber}`);
  console.log(`Comment by: ${commenter}`);
  console.log(`Comment: ${comment.substring(0, 100)}...`);

  // Check all conditions
  const hasMention = containsMention(comment, GITHUB_USERNAME);
  const hasTriggerWord = containsTriggerWord(comment);
  const hasQuickTrigger = containsQuickTriggerWord(comment);
  const hasEmoji = containsEmoji(comment);

  console.log(`Conditions - Mention @${GITHUB_USERNAME}: ${hasMention}, trigger: ${hasTriggerWord}, quick trigger: ${hasQuickTrigger}, emoji: ${hasEmoji}`);

  if (hasMention && hasTriggerWord && hasEmoji) {
    if (hasQuickTrigger) {
      console.log('Quick trigger detected! Approving PR instantly...');
      const result = approvePR(repoFullName, prNumber);
      console.log(`PR #${prNumber} approval finished - ${result.success ? 'SUCCESS' : 'FAILED'}`);
      sendSlackMessage({
        repoFullName,
        prNumber,
        success: result.success,
        reason: result.reason,
        triggeredBy: commenter,
        approver: GITHUB_USERNAME,
        isQuickTrigger: true
      });
    } else {
      const delaySeconds = getRandomDelay();
      console.log(`All conditions met! Approving PR in ${delaySeconds} seconds...`);

      setTimeout(() => {
        const result = approvePR(repoFullName, prNumber);
        console.log(`PR #${prNumber} approval finished - ${result.success ? 'SUCCESS' : 'FAILED'}`);
        sendSlackMessage({
          repoFullName,
          prNumber,
          success: result.success,
          reason: result.reason,
          triggeredBy: commenter,
          approver: GITHUB_USERNAME,
          isQuickTrigger: false
        });
      }, delaySeconds * 1000);
    }
  } else {
    console.log('Conditions not met, no action taken');
  }

  return res.status(200).json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`AutoApproveBot started on port ${PORT}`);
  console.log(`Watching for mentions of: @${GITHUB_USERNAME}`);
  console.log(`========================================\n`);
  console.log(`Conditions for auto-approval:`);
  console.log(`  1. Comment on a PR`);
  console.log(`  2. Mentions @${GITHUB_USERNAME}`);
  console.log(`  3. Contains a trigger word or quick trigger`);
  console.log(`  4. Contains any emoji`);
  console.log(`\nTrigger words (delayed ${delayConfig.minSeconds}-${delayConfig.maxSeconds}s): ${triggerWords.join(', ')}`);
  console.log(`Quick triggers (instant, requires trigger word): ${quickTriggerWords.join(', ')}`);
  console.log(`\nSlack notifications: ${slackWebhookUrl ? 'enabled' : 'disabled'}`);
  console.log(`\nExample comment that would trigger approval:`);
  console.log(`  "@${GITHUB_USERNAME} please review this PR! 🙏"`);
  console.log(`\nWaiting for webhook events...\n`);
});
