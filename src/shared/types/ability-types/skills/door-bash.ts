import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class DoorBash implements IAbility {
  private static instance: DoorBash;

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
    this.helpFile = `help doorbash
DOOR BASH
A powerful technique for breaking down doors or obstacles.`;

    this.manualDescription = "";

    if (DoorBash.instance === undefined) {
      DoorBash.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): DoorBash {
    if (!DoorBash.instance) {
      DoorBash.instance = new DoorBash();
    }
    return DoorBash.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DoorBash.GetInstance() as T;
  }
}

export default DoorBash;
