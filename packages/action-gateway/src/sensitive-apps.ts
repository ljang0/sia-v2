/**
 * Apps that generic computer tools must never drive: password managers, Keychain, terminals,
 * system settings, automation editors, browsers (use the browser tools), and Sia itself. Names
 * match as whole words so ordinary names that merely contain them stay usable.
 */
const SENSITIVE_COMPUTER_APP =
  /(?:^|[\s._-])(?:sia|1password|bitwarden|lastpass|dashlane|keeper|enpass|strongbox|keepass|secrets?|authenticator|keychain|password|terminal|iterm|warp|alacritty|system settings|system preferences|script editor|scripteditor2?|automator|shortcuts|chrome|chromium|safari|firefox|arc|brave|edge|opera|vivaldi|orion|dia)(?:$|[\s._-])|(?:ai\.sia\.desktop|com\.apple\.security|com\.google\.chrome)/i;

/** The single sensitive-app check for app names and bundle identifiers. */
export function isSensitiveComputerApp(...values: ReadonlyArray<string | undefined>): boolean {
  return values.some((value) => value !== undefined && SENSITIVE_COMPUTER_APP.test(value));
}
