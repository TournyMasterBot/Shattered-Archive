import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CreateRunestaff implements IAbility {
  private static instance: CreateRunestaff;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Create Runestaff";
    this.helpFile = ""; // Add help text if needed
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (CreateRunestaff.instance === undefined) {
      CreateRunestaff.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CreateRunestaff {
    if (!CreateRunestaff.instance) {
      CreateRunestaff.instance = new CreateRunestaff();
    }
    return CreateRunestaff.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CreateRunestaff.GetInstance() as T;
  }
}

export default CreateRunestaff;
