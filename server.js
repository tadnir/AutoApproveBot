const express = require('express');
const { execSync } = require('child_process');

const app = express();
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

function containsReview(text) {
  return /\breview\b/i.test(text);
}

function containsMention(text, username) {
  const mentionPattern = new RegExp(`@${username}\\b`, 'i');
  return mentionPattern.test(text);
}

function approvePR(repoFullName, prNumber) {
  try {
    const command = `gh pr review ${prNumber} --repo ${repoFullName} --approve --body "Auto-approved by AutoApproveBot"`;
    console.log(`Executing: ${command}`);
    const result = execSync(command, { encoding: 'utf-8' });
    console.log(`PR #${prNumber} approved successfully`);
    return true;
  } catch (error) {
    console.error(`Failed to approve PR #${prNumber}:`, error.message);
    return false;
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
  const hasReview = containsReview(comment);
  const hasEmoji = containsEmoji(comment);

  console.log(`Conditions - Mention @${GITHUB_USERNAME}: ${hasMention}, "review": ${hasReview}, emoji: ${hasEmoji}`);

  if (hasMention && hasReview && hasEmoji) {
    console.log('All conditions met! Approving PR...');
    const success = approvePR(repoFullName, prNumber);
    return res.status(200).json({
      message: success ? 'PR approved' : 'Failed to approve PR',
      approved: success
    });
  }

  console.log('Conditions not met, no action taken');
  return res.status(200).json({ message: 'Conditions not met' });
});

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`AutoApproveBot started on port ${PORT}`);
  console.log(`Watching for mentions of: @${GITHUB_USERNAME}`);
  console.log(`========================================\n`);
  console.log(`Conditions for auto-approval:`);
  console.log(`  1. Comment on a PR`);
  console.log(`  2. Mentions @${GITHUB_USERNAME}`);
  console.log(`  3. Contains the word "review"`);
  console.log(`  4. Contains any emoji`);
  console.log(`\nExample comment that would trigger approval:`);
  console.log(`  "@${GITHUB_USERNAME} please review this PR! 🙏"`);
  console.log(`\nWaiting for webhook events...\n`);
});
