import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Mudcoat implements IAbility {
  private static instance: Mudcoat;

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
    this.name = "Mudcoat";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
MUDCOAT

Syntax: cast ‘mudcoat’ <item>

The barbarian’s heathen culture carries over into the protection of their
belongings, using the most basic of means, mud, to effectively protect their
gear from the effects of acid and flame for a short period of time.

Groups containing this skill: BARBARIAN DEFAULT
`;
    this.manualDescription = "Mudcoat acts as both bless and fireproof for items";

    if (Mudcoat.instance === undefined) {
      Mudcoat.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Mudcoat {
    if (!Mudcoat.instance) {
      Mudcoat.instance = new Mudcoat();
    }
    return Mudcoat.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Mudcoat.GetInstance() as T;
  }
}

export default Mudcoat;
