import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class KayensShield implements IAbility {
  private static instance: KayensShield;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Kayens Shield";
    this.helpFile = "";
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (KayensShield.instance === undefined) {
      KayensShield.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): KayensShield {
    if (!KayensShield.instance) {
      KayensShield.instance = new KayensShield();
    }
    return KayensShield.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return KayensShield.GetInstance() as T;
  }
}

export default KayensShield;
