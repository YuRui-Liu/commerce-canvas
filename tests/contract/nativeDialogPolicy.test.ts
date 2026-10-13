import { expect, it } from 'vitest';
import { assertNativeDialogAllowed } from '../../apps/desktop/src/main/nativeDialogPolicy';

it('prevents the original native picker in isolated tests before invoking it', () => {
  let calls = 0;
  const native = () => { calls++; };
  expect(() => { assertNativeDialogAllowed(true, native, native); native(); }).toThrow('NATIVE_DIALOG_DISABLED_IN_TEST');
  expect(calls).toBe(0);
});

it('allows normal app use and an explicitly replaced test picker', () => {
  const native = () => {};
  const replacement = () => {};
  expect(() => assertNativeDialogAllowed(false, native, native)).not.toThrow();
  expect(() => assertNativeDialogAllowed(true, replacement, native)).not.toThrow();
});
