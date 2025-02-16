export const damageCategoryType = {
  Unknown: "unknown",
  None: "none",
  Negative: "negative",
};

export const DslDamageCategoryType = {
  ...damageCategoryType,
} as const;
export type DslDamageCategoryType =
  (typeof DslDamageCategoryType)[keyof typeof DslDamageCategoryType];
