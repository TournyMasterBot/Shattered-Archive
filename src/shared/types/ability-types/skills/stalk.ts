import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Stalk implements IAbility {
  private static instance: Stalk;

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
    this.name = "Stalk";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;
    this.helpFile = `
stalk
Stalk is a player vs player skill that allows the Nightshade to follow a
victim, even when their no-follow flag is on.
`;

    if (Stalk.instance === undefined) {
      Stalk.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Stalk {
    if (!Stalk.instance) {
      Stalk.instance = new Stalk();
    }
    return Stalk.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Stalk.GetInstance() as T;
  }
}

export default Stalk;
