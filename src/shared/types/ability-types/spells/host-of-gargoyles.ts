import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class HostOfGargoyles implements IAbility {
  private static instance: HostOfGargoyles;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Host of Gargoyles";
    this.helpFile = "";
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (HostOfGargoyles.instance === undefined) {
      HostOfGargoyles.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): HostOfGargoyles {
    if (!HostOfGargoyles.instance) {
      HostOfGargoyles.instance = new HostOfGargoyles();
    }
    return HostOfGargoyles.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return HostOfGargoyles.GetInstance() as T;
  }
}

export default HostOfGargoyles;
