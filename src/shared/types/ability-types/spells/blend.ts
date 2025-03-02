import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Blend implements IAbility {
  private static instance: Blend;

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
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
help blend
blend
The blend spell will blend you into the background of any room or area. 
As long as you don't move, you will remain perfectly undetectable.
`;

    if (Blend.instance === undefined) {
      Blend.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Blend {
    if (!Blend.instance) {
      Blend.instance = new Blend();
    }
    return Blend.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Blend.GetInstance() as T;
  }
}

export default Blend;
