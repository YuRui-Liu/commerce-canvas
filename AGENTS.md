# CommerceCanvas development

## Desktop tests must not interrupt the user

The user explicitly requested on 2026-10-13 that test application windows stay minimized and do not pop up during their work. Prefer hidden windows from creation, rather than showing and then minimizing them.

- Run Electron tests with the validated temporary `COMMERCECANVAS_TEST_USER_DATA` profile. Test windows must use `show: false`; background rendering/timers must remain available for automation.
- Do not call native window show/focus/bring-to-front or display native error/file dialogs during automated tests. Keep errors observable in the test result and application state. DOM focus assertions and screenshots of hidden windows are allowed.
- Rebuild old packaged applications before testing if they predate the hidden-window policy. Do not launch an old visible package to validate the policy.
- Close only applications and windows created by the current test. Do not affect the user's other windows or normal profile.
- When a check inherently needs a visible window, record it as unverified and continue independent work; do not silently bring it to the foreground.

## Current implementation workflow

Use one implementation agent per task, followed by independent specification and quality reviews. Do not delegate parallel implementation workers within a task. Preserve changes made by others and keep validation claims tied to actual evidence.

Image generation connects directly to GRSai. Do not add a proxy service, token resale layer, account pool, or billing UI.
