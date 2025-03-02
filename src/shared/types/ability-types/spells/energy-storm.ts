import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class EnergyStorm implements IAbility {
  private static instance: EnergyStorm;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
`;
    this.manualDescription = "Energy Storm is the Mage bounty skill";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (EnergyStorm.instance === undefined) {
      EnergyStorm.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): EnergyStorm {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return EnergyStorm.GetInstance() as T;
  }
}

export default EnergyStorm;
