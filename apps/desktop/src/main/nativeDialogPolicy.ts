/** A test must explicitly replace its picker; renderer input cannot bypass this. */
export function assertNativeDialogAllowed(isolated: boolean, currentPicker: unknown, nativePicker: unknown): void {
  if (isolated && currentPicker === nativePicker) throw new Error('NATIVE_DIALOG_DISABLED_IN_TEST');
}
