#!/bin/bash
# Git Hooks Integration with SSH Notify Tool
# Install: Copy hook scripts to .git/hooks/ directory

# =============================================================================
# PRE-COMMIT HOOK
# Save as: .git/hooks/pre-commit
# =============================================================================

pre_commit_hook() {
    #!/bin/bash
    # Git pre-commit hook with notifications
    
    # Configuration
    NOTIFY_SERVER="${NOTIFY_SERVER:-http://localhost:3000}"
    NOTIFY_TOKEN="${NOTIFY_TOKEN:-}"
    NOTIFY_REMOTE="${NOTIFY_REMOTE:-}"
    
    # Function to send notifications
    notify() {
        local title="$1"
        local message="$2"
        local level="${3:-info}"
        
        if [[ -n "$NOTIFY_REMOTE" ]]; then
            notify-cli "$title" \
                --message "$message" \
                --level "$level" \
                --remote "$NOTIFY_REMOTE" \
                --token "$NOTIFY_TOKEN" \
                --channels "desktop" \
                --metadata "{\"repository\":\"$(git remote get-url origin)\",\"branch\":\"$(git branch --show-current)\",\"author\":\"$(git config user.name)\"}" \
                --tags "git,pre-commit,$(git branch --show-current)" \
                --quiet
        else
            curl -s -X POST "$NOTIFY_SERVER/api/notify" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $NOTIFY_TOKEN" \
                -d "{
                    \"title\": \"$title\",
                    \"message\": \"$message\",
                    \"level\": \"$level\",
                    \"channels\": [\"desktop\"],
                    \"metadata\": {
                        \"repository\": \"$(git remote get-url origin 2>/dev/null || echo 'local')\",
                        \"branch\": \"$(git branch --show-current)\",
                        \"author\": \"$(git config user.name)\",
                        \"hook\": \"pre-commit\"
                    },
                    \"tags\": [\"git\", \"pre-commit\", \"$(git branch --show-current)\"]
                }" > /dev/null
        fi
    }
    
    # Check for debugging code
    if git diff --cached --name-only | grep -E '\.(js|ts|py|rb|php|java)$' | xargs grep -l "console\.log\|debugger\|pdb\.set_trace\|binding\.pry" 2>/dev/null; then
        echo "⚠️  Debugging code detected in staged files"
        echo "Files contain console.log, debugger, or similar debugging statements"
        
        notify "⚠️ Debug Code in Commit" \
            "Attempting to commit debugging code in $(git remote get-url origin 2>/dev/null | sed 's/.*\///' | sed 's/\.git//')" \
            "warning"
        
        echo "Do you want to continue? (y/N)"
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    # Run linting if available
    if command -v eslint >/dev/null 2>&1 && [[ -f .eslintrc* ]]; then
        echo "Running ESLint..."
        if ! git diff --cached --name-only | grep -E '\.(js|ts|jsx|tsx)$' | xargs eslint --quiet; then
            notify "❌ Lint Errors" \
                "ESLint found errors in staged files" \
                "error"
            exit 1
        fi
    fi
    
    # Run tests if available
    if [[ -f package.json ]] && grep -q '"test"' package.json; then
        echo "Running tests..."
        if ! npm test -- --passWithNoTests --silent; then
            notify "❌ Tests Failed" \
                "Tests failed during pre-commit hook" \
                "error"
            exit 1
        fi
    fi
    
    # Check for large files
    large_files=$(git diff --cached --name-only | xargs ls -la 2>/dev/null | awk '$5 > 10485760 {print $9, $5}')
    if [[ -n "$large_files" ]]; then
        echo "⚠️  Large files detected (>10MB):"
        echo "$large_files"
        
        notify "⚠️ Large Files in Commit" \
            "Attempting to commit files larger than 10MB" \
            "warning"
        
        echo "Do you want to continue? (y/N)"
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# =============================================================================
# POST-COMMIT HOOK
# Save as: .git/hooks/post-commit
# =============================================================================

post_commit_hook() {
    #!/bin/bash
    # Git post-commit hook with notifications
    
    # Configuration
    NOTIFY_SERVER="${NOTIFY_SERVER:-http://localhost:3000}"
    NOTIFY_TOKEN="${NOTIFY_TOKEN:-}"
    NOTIFY_REMOTE="${NOTIFY_REMOTE:-}"
    
    # Get commit information
    COMMIT_HASH=$(git rev-parse HEAD)
    COMMIT_MESSAGE=$(git log -1 --pretty=%B)
    BRANCH=$(git branch --show-current)
    AUTHOR=$(git log -1 --pretty=%an)
    FILES_CHANGED=$(git diff-tree --no-commit-id --name-only -r HEAD | wc -l)
    REPO_NAME=$(git remote get-url origin 2>/dev/null | sed 's/.*\///' | sed 's/\.git//' || echo "local-repo")
    
    # Function to send notifications
    notify() {
        local title="$1"
        local message="$2"
        local level="${3:-info}"
        
        local metadata="{
            \"repository\": \"$REPO_NAME\",
            \"branch\": \"$BRANCH\",
            \"commit\": \"$COMMIT_HASH\",
            \"author\": \"$AUTHOR\",
            \"filesChanged\": $FILES_CHANGED,
            \"hook\": \"post-commit\"
        }"
        
        if [[ -n "$NOTIFY_REMOTE" ]]; then
            notify-cli "$title" \
                --message "$message" \
                --level "$level" \
                --remote "$NOTIFY_REMOTE" \
                --token "$NOTIFY_TOKEN" \
                --channels "desktop" \
                --metadata "$metadata" \
                --tags "git,commit,$BRANCH" \
                --quiet
        else
            curl -s -X POST "$NOTIFY_SERVER/api/notify" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $NOTIFY_TOKEN" \
                -d "{
                    \"title\": \"$title\",
                    \"message\": \"$message\",
                    \"level\": \"$level\",
                    \"channels\": [\"desktop\"],
                    \"metadata\": $metadata,
                    \"tags\": [\"git\", \"commit\", \"$BRANCH\"]
                }" > /dev/null
        fi
    }
    
    # Only notify for significant commits (more than just formatting)
    if [[ $FILES_CHANGED -gt 0 ]]; then
        # Truncate long commit messages
        SHORT_MESSAGE=$(echo "$COMMIT_MESSAGE" | head -1 | cut -c1-100)
        [[ ${#COMMIT_MESSAGE} -gt 100 ]] && SHORT_MESSAGE="$SHORT_MESSAGE..."
        
        notify "✅ Commit Successful" \
            "$AUTHOR committed to $BRANCH: $SHORT_MESSAGE" \
            "success"
    fi
}

# =============================================================================
# POST-PUSH HOOK (requires server-side configuration)
# Save as: .git/hooks/post-receive (on remote repository)
# =============================================================================

post_push_hook() {
    #!/bin/bash
    # Git post-push hook (server-side) with notifications
    
    # Configuration
    NOTIFY_SERVER="${NOTIFY_SERVER:-http://localhost:3000}"
    NOTIFY_TOKEN="${NOTIFY_TOKEN:-}"
    
    while read oldrev newrev refname; do
        # Extract branch name
        BRANCH=$(echo "$refname" | sed 's/refs\/heads\///')
        
        # Skip if it's a deletion
        if [[ "$newrev" == "0000000000000000000000000000000000000000" ]]; then
            continue
        fi
        
        # Get push information
        if [[ "$oldrev" == "0000000000000000000000000000000000000000" ]]; then
            # New branch
            COMMIT_COUNT=$(git rev-list --count "$newrev")
            FIRST_COMMIT=$(git rev-list --reverse "$newrev" | head -1)
            LAST_COMMIT="$newrev"
        else
            # Existing branch update
            COMMIT_COUNT=$(git rev-list --count "$oldrev..$newrev")
            FIRST_COMMIT=$(git rev-list --reverse "$oldrev..$newrev" | head -1)
            LAST_COMMIT="$newrev"
        fi
        
        # Get pusher information
        PUSHER=$(git log -1 --pretty=%an "$newrev")
        REPO_NAME=$(pwd | sed 's/.*\///')
        
        # Prepare notification
        if [[ $COMMIT_COUNT -eq 1 ]]; then
            MESSAGE="$PUSHER pushed 1 commit to $BRANCH"
            COMMIT_MESSAGE=$(git log -1 --pretty=%B "$newrev" | head -1)
            DETAILED_MESSAGE="$MESSAGE: $COMMIT_MESSAGE"
        else
            MESSAGE="$PUSHER pushed $COMMIT_COUNT commits to $BRANCH"
            DETAILED_MESSAGE="$MESSAGE ($(git rev-parse --short "$FIRST_COMMIT")..$(git rev-parse --short "$LAST_COMMIT"))"
        fi
        
        # Send notification
        curl -s -X POST "$NOTIFY_SERVER/api/notify" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $NOTIFY_TOKEN" \
            -d "{
                \"title\": \"🚀 Code Pushed\",
                \"message\": \"$DETAILED_MESSAGE\",
                \"level\": \"info\",
                \"channels\": [\"desktop\", \"slack\"],
                \"metadata\": {
                    \"repository\": \"$REPO_NAME\",
                    \"branch\": \"$BRANCH\",
                    \"pusher\": \"$PUSHER\",
                    \"commitCount\": $COMMIT_COUNT,
                    \"firstCommit\": \"$(git rev-parse --short "$FIRST_COMMIT")\",
                    \"lastCommit\": \"$(git rev-parse --short "$LAST_COMMIT")\",
                    \"hook\": \"post-receive\"
                },
                \"tags\": [\"git\", \"push\", \"$BRANCH\"],
                \"priority\": 3
            }" > /dev/null
    done
}

# =============================================================================
# INSTALLATION SCRIPT
# =============================================================================

install_hooks() {
    #!/bin/bash
    # Install git hooks with SSH Notify Tool integration
    
    echo "Installing Git hooks with SSH Notify Tool integration..."
    
    # Check if we're in a git repository
    if [[ ! -d .git ]]; then
        echo "Error: Not in a git repository"
        exit 1
    fi
    
    # Create hooks directory if it doesn't exist
    mkdir -p .git/hooks
    
    # Install pre-commit hook
    cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
# Pre-commit hook with SSH Notify Tool integration

NOTIFY_SERVER="${NOTIFY_SERVER:-http://localhost:3000}"
NOTIFY_TOKEN="${NOTIFY_TOKEN:-}"
NOTIFY_REMOTE="${NOTIFY_REMOTE:-}"

notify() {
    local title="$1"
    local message="$2"
    local level="${3:-info}"
    
    if [[ -n "$NOTIFY_REMOTE" ]]; then
        notify-cli "$title" --message "$message" --level "$level" --remote "$NOTIFY_REMOTE" --token "$NOTIFY_TOKEN" --channels "desktop" --quiet
    else
        curl -s -X POST "$NOTIFY_SERVER/api/notify" -H "Content-Type: application/json" -H "Authorization: Bearer $NOTIFY_TOKEN" -d "{\"title\":\"$title\",\"message\":\"$message\",\"level\":\"$level\",\"channels\":[\"desktop\"]}" > /dev/null
    fi
}

# Check for debugging code
if git diff --cached --name-only | grep -E '\.(js|ts|py|rb|php|java)$' | xargs grep -l "console\.log\|debugger\|pdb\.set_trace\|binding\.pry" 2>/dev/null; then
    echo "⚠️  Debugging code detected in staged files"
    notify "⚠️ Debug Code in Commit" "Attempting to commit debugging code" "warning"
    echo "Do you want to continue? (y/N)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi
EOF

    # Install post-commit hook
    cat > .git/hooks/post-commit << 'EOF'
#!/bin/bash
# Post-commit hook with SSH Notify Tool integration

NOTIFY_SERVER="${NOTIFY_SERVER:-http://localhost:3000}"
NOTIFY_TOKEN="${NOTIFY_TOKEN:-}"
NOTIFY_REMOTE="${NOTIFY_REMOTE:-}"

COMMIT_MESSAGE=$(git log -1 --pretty=%B | head -1)
BRANCH=$(git branch --show-current)
AUTHOR=$(git log -1 --pretty=%an)
FILES_CHANGED=$(git diff-tree --no-commit-id --name-only -r HEAD | wc -l)

if [[ $FILES_CHANGED -gt 0 ]]; then
    SHORT_MESSAGE=$(echo "$COMMIT_MESSAGE" | cut -c1-100)
    [[ ${#COMMIT_MESSAGE} -gt 100 ]] && SHORT_MESSAGE="$SHORT_MESSAGE..."
    
    if [[ -n "$NOTIFY_REMOTE" ]]; then
        notify-cli "✅ Commit Successful" --message "$AUTHOR committed to $BRANCH: $SHORT_MESSAGE" --level "success" --remote "$NOTIFY_REMOTE" --token "$NOTIFY_TOKEN" --channels "desktop" --quiet
    else
        curl -s -X POST "$NOTIFY_SERVER/api/notify" -H "Content-Type: application/json" -H "Authorization: Bearer $NOTIFY_TOKEN" -d "{\"title\":\"✅ Commit Successful\",\"message\":\"$AUTHOR committed to $BRANCH: $SHORT_MESSAGE\",\"level\":\"success\",\"channels\":[\"desktop\"]}" > /dev/null
    fi
fi
EOF

    # Make hooks executable
    chmod +x .git/hooks/pre-commit
    chmod +x .git/hooks/post-commit
    
    echo "✅ Git hooks installed successfully!"
    echo ""
    echo "Configuration:"
    echo "Set environment variables in your shell profile:"
    echo "  export NOTIFY_SERVER=\"http://your-server:3000\""
    echo "  export NOTIFY_TOKEN=\"your-auth-token\""
    echo "  export NOTIFY_REMOTE=\"user@your-machine\"  # For SSH tunnels"
    echo ""
    echo "Test the hooks:"
    echo "  git add . && git commit -m \"Test commit with notifications\""
}

# =============================================================================
# USAGE EXAMPLES
# =============================================================================

usage_examples() {
    cat << 'EOF'
# Git Hooks Usage Examples

## Installation
cd your-git-repository
./git-hooks.sh install

## Environment Configuration
export NOTIFY_SERVER="http://localhost:3000"
export NOTIFY_TOKEN="your-auth-token"

# For remote notifications via SSH tunnel:
export NOTIFY_REMOTE="user@your-local-machine"

## Testing Hooks
# Test pre-commit hook with debugging code:
echo "console.log('debug');" >> test.js
git add test.js
git commit -m "Test commit"  # Will warn about debug code

# Test post-commit notifications:
git add .
git commit -m "Feature: Add new functionality"

## Server-side Hook (for shared repositories)
# On your Git server, in the repository's hooks directory:
cp post-push-hook.sh /path/to/repo.git/hooks/post-receive
chmod +x /path/to/repo.git/hooks/post-receive

## Customization
# Edit hooks in .git/hooks/ to customize:
# - Notification channels
# - Commit message filtering
# - Additional checks (code quality, security, etc.)

## Integration with CI/CD
# Hooks work alongside CI/CD pipelines:
# - Pre-commit: Local quality checks
# - Post-commit: Local notification
# - Post-push: Server-side notification
# - CI/CD: Build and deployment notifications
EOF
}

# Main script logic
case "${1:-}" in
    install)
        install_hooks
        ;;
    examples|usage)
        usage_examples
        ;;
    *)
        echo "Git Hooks Integration for SSH Notify Tool"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  install    Install git hooks in current repository"
        echo "  examples   Show usage examples"
        echo ""
        echo "The hooks will send notifications for:"
        echo "  - Pre-commit: Warn about debugging code, run lints/tests"
        echo "  - Post-commit: Notify successful commits"
        echo "  - Post-push: Notify when code is pushed (server-side)"
        ;;
esac