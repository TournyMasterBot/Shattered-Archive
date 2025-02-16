import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Dragonlance implements IAbility {
  private static instance: Dragonlance;

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
    this.name = "Dragonlance";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `help dragonlance
DRAGONLANCE
Syntax: dragonlance <target>
An ancient and powerful lance skill, available to skilled warriors.`;

    this.manualDescription = "";

    if (Dragonlance.instance === undefined) {
      Dragonlance.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Dragonlance {
    if (!Dragonlance.instance) {
      Dragonlance.instance = new Dragonlance();
    }
    return Dragonlance.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Dragonlance.GetInstance() as T;
  }
}

export default Dragonlance;
