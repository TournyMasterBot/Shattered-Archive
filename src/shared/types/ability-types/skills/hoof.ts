import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Hoof implements IAbility {
  private static instance: Hoof;

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
    this.name = "Hoof";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = ``;
    this.manualDescription = `Strike your opponent with your hoof, damaging them with the potential to stun them.`;

    if (Hoof.instance === undefined) {
      Hoof.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Hoof {
    if (!Hoof.instance) {
      Hoof.instance = new Hoof();
    }
    return Hoof.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Hoof.GetInstance() as T;
  }
}

export default Hoof;
