import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CriticalStrike implements IAbility {
  private static instance: CriticalStrike;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
`;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.manualDescription = "Critical Strike is the Warrior bounty skill";

    if (CriticalStrike.instance === undefined) {
      CriticalStrike.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CriticalStrike {
    if (!CriticalStrike.instance) {
      CriticalStrike.instance = new CriticalStrike();
    }
    return CriticalStrike.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CriticalStrike.GetInstance() as T;
  }
}

export default CriticalStrike;
