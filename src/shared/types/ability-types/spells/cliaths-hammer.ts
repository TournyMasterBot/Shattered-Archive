import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CliathsHammer implements IAbility {
  private static instance: CliathsHammer;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Cliaths Hammer";
    this.helpFile = `
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (CliathsHammer.instance === undefined) {
      CliathsHammer.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CliathsHammer {
    if (!CliathsHammer.instance) {
      CliathsHammer.instance = new CliathsHammer();
    }
    return CliathsHammer.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CliathsHammer.GetInstance() as T;
  }
}

export default CliathsHammer;
