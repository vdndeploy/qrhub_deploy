"""Playwright test for dynamic hero band color sampling on StoreLanding.
Verifies that band saturation S >= 0.65 and L >= 0.45 across multiple hero images,
plus regressions: empty hero, cross-origin fallback, crossOrigin attribute presence.
"""
