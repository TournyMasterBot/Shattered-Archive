import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Shadowbolt implements IAbility {
  private static instance: Shadowbolt;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Shadowbolt";
    this.helpFile = "";
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Shadowbolt.instance === undefined) {
      Shadowbolt.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Shadowbolt {
    if (!Shadowbolt.instance) {
      Shadowbolt.instance = new Shadowbolt();
    }
    return Shadowbolt.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Shadowbolt.GetInstance() as T;
  }
}

export default Shadowbolt;
