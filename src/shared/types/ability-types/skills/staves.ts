import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Staves implements IAbility {
  private static instance: Staves;

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
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
STAVES
Allows you to brandish staffs and invoke the spells contained within.
`;
    this.manualDescription = `
Allows you to brandish staffs and invoke the spells contained within.
`;
    this.alternateKeyword = "staff";
    this.recommendedHelpFileChanges =
      "The skill is called staves, but the help file references staff. I would recommend swapping out 'staff' and 'staves' OR adding 'staves' as a keyword";

    if (Staves.instance === undefined) {
      Staves.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Staves {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Staves.GetInstance() as T;
  }
}

export default Staves;
