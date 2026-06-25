# Playwright regression test for PushSubscribe denied-permission UX fix.
# Run against the public VendorLanding (no auth). Verifies:
#  - permission==='denied' at mount renders push-blocked-btn (amber styling)
#  - click opens HelpDialog with platform-specific instructions
#  - X and 'Ho capito' both close the dialog
#  - default permission still shows push-subscribe-btn
#  - iOS Safari non-standalone renders push-ios-hint
#  - iOS denied renders push-blocked-btn with iOS instructions
#  - NO 'Permesso notifiche negato' toast appears anywhere
#
# Usage:
#   pytest /app/tests/playwright/test_push_subscribe_blocked.py
# Note: this is documentation of what was tested via the
# mcp_browser_automation tool. Adapt URL via env if needed.
URL = "https://qr-deploy-1.preview.emergentagent.com/v/6a0c73f2fbb39d92c9f5edd6"
