export const env = {
  ...(typeof process !== "undefined" ? process.env : {}),
  ...import.meta.env,
} as ImportMetaEnv & NodeJS.ProcessEnv;
