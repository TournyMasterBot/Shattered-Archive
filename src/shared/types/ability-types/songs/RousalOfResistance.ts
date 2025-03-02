import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class RousalOfResistance implements IAbility {
  private static instance: RousalOfResistance;

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
Rousal of Resistance - A lively tempoed chant that increases the groups 
ability to resist various harmful spells that may be cast upon them.
`;
    this.manualDescription = "This song is a chant";

    if (RousalOfResistance.instance === undefined) {
      RousalOfResistance.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): RousalOfResistance {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return RousalOfResistance.GetInstance() as T;
  }
}

export default RousalOfResistance;
