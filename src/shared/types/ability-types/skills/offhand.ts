import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Offhand implements IAbility {
  private static instance: Offhand;

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
    this.helpFile = ``;

    if (Offhand.instance === undefined) {
      Offhand.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Offhand {
    if (!Offhand.instance) {
      Offhand.instance = new Offhand();
    }
    return Offhand.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Offhand.GetInstance() as T;
  }
}

export default Offhand;
