import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class YelpOfAggression implements IAbility {
  private static instance: YelpOfAggression;

  name: string;
  helpFile: string;
  manualDescription?: string | undefined;
  duration?: number | undefined;
  effects?: SkillSpellEffects | undefined;
  group?: string | undefined;
  alternateKeyword?: string | undefined;
  recommendedHelpFileChanges?: string | undefined;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroupType = AbilityGroupType.Songs;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
Yelp of Aggression - This skald's chant enables the skald to increase the
group's physical damage capabilities upon its enemies.
`;
    this.manualDescription = "This song is a chant";

    if (YelpOfAggression.instance === undefined) {
      YelpOfAggression.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): YelpOfAggression {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return YelpOfAggression.GetInstance() as T;
  }
}

export default YelpOfAggression;
