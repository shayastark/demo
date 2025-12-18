# Git & GitHub Setup

Your repository is already initialized and connected to GitHub! Here's what's configured and what you need to know.

## Current Status

✅ **Git initialized**  
✅ **Remote configured**: `git@github.com:shayastark/hubba.git` (SSH)  
✅ **SSH keys found**: You have SSH keys for GitHub  
⚠️ **Git user email**: Not yet configured (optional but recommended)

## Configure Git User (Optional but Recommended)

Set your git identity for commits:

```bash
git config user.name "Your Name"
git config user.email "your-email@example.com"
```

Or set globally for all repos:
```bash
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

## Authentication Methods

### Option 1: SSH (Recommended - Already Configured)

The remote has been switched to SSH (`git@github.com:...`). This uses your SSH keys.

**To test SSH connection:**
```bash
ssh -T git@github.com
```

You should see: `Hi shayastark! You've successfully authenticated...`

**If SSH isn't working**, make sure your SSH key is added to GitHub:
1. Copy your public key: `cat ~/.ssh/id_ed25519_github.pub`
2. Go to GitHub → Settings → SSH and GPG keys → New SSH key
3. Paste the key and save

### Option 2: HTTPS (Alternative)

If you prefer HTTPS, you can switch back:
```bash
git remote set-url origin https://github.com/shayastark/hubba.git
```

With HTTPS, you'll need:
- **Personal Access Token** (not your password)
- Generate one: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
- Use it as your password when pushing

## Making Your First Commit

Now you can add, commit, and push:

```bash
# Add all files (respects .gitignore)
git add .

# Commit with a message
git commit -m "Initial commit: Hubba app setup"

# Push to GitHub
git push origin main
```

## Useful Git Commands

```bash
# Check status
git status

# See what's changed
git diff

# Add specific files
git add filename

# Commit with message
git commit -m "Your commit message"

# Push changes
git push origin main

# Pull latest changes
git pull origin main

# See commit history
git log --oneline
```

## Security Notes

- ✅ `.gitignore` is configured to ignore `.env.local` and other secrets
- ✅ Only `.env.local.example` (template) will be committed
- ✅ Never commit actual credentials

## Troubleshooting

**"Permission denied (publickey)"**
- Make sure your SSH key is added to GitHub
- Test: `ssh -T git@github.com`

**"Authentication failed" (HTTPS)**
- Use a Personal Access Token, not your password
- Generate token: GitHub Settings → Developer settings → Personal access tokens

**"Remote origin already exists"**
- This is fine! It just means the remote is already configured.

