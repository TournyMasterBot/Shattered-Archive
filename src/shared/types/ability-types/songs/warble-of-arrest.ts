import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class WarbleOfArrest implements IAbility {
  private static instance: WarbleOfArrest;

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
    this.name = "Warble of Arrest";
    this.abilityGroupType = AbilityGroupType.Songs;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
Warble of Arrest - When the Skald calls this song upon their lips to 
sing, the warble can allow the Skald the ability to halt a person's 
movement. 
`;
    this.manualDescription = "* Behaves similarly to jest";

    if (WarbleOfArrest.instance === undefined) {
      WarbleOfArrest.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): WarbleOfArrest {
    if (!WarbleOfArrest.instance) {
      WarbleOfArrest.instance = new WarbleOfArrest();
    }
    return WarbleOfArrest.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return WarbleOfArrest.GetInstance() as T;
  }
}

export default WarbleOfArrest;
